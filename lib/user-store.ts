import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { Redis } from '@upstash/redis'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createRedisClient, type RedisClientType } from 'redis'

export type UserRole = 'admin' | 'user'

export type PlanType = 'weekly' | 'monthly'

export type StoredUser = {
  username: string
  email: string | null
  role: UserRole
  salt: string
  passwordHash: string
  active: boolean
  telegramChatId: string | null
  telegramLinkedAt: string | null
  createdAt: string
  updatedAt: string
  // Campos de plano/pagamento
  planType?: PlanType | null
  planExpiresAt?: string | null   // ISO datetime
  planActivatedAt?: string | null // ISO datetime
  planPaymentId?: string | null   // ID do pagamento no Mercado Pago
}

type UserStore = {
  users: StoredUser[]
}

type SeedUser = {
  username: string
  password: string
}

export type UserBackup = {
  version: 1
  exportedAt: string
  users: StoredUser[]
}

export type PublicUser = {
  username: string
  email: string | null
  role: UserRole
  active: boolean
  telegramChatId: string | null
  telegramLinkedAt: string | null
  createdAt: string
  updatedAt: string
  planType?: PlanType | null
  planExpiresAt?: string | null
  planActivatedAt?: string | null
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'usdtbot')
  : path.join(process.cwd(), 'data')
const BUNDLED_USERS_FILE = path.join(process.cwd(), 'data', 'users.json')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const KV_USERS_KEY = 'usdtbot:users:v1'
const SUPABASE_STORAGE_TABLE = (process.env.SUPABASE_STORAGE_TABLE ?? 'app_storage').trim()

type StorageBackend = 'file' | 'kv-rest' | 'kv-redis-url' | 'supabase'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const COURTESY_ACCESS_EMAIL = 'mmec201x@gmail.com'
const COURTESY_ACCESS_DURATION_DAYS = 30

let redisClient: Redis | null = null
let redisUrlClient: RedisClientType | null = null
let redisUrlConnecting: Promise<RedisClientType> | null = null
let supabaseClient: SupabaseClient | null = null

function shouldRequireDurableStorage(): boolean {
  return Boolean(process.env.VERCEL) && process.env.ALLOW_EPHEMERAL_USER_STORAGE !== 'true'
}

function getFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) {
      return value
    }
  }

  return undefined
}

function getRestUrl(): string | undefined {
  return getFirstEnv([
    'KV_REST_API_URL',
    'UPSTASH_REDIS_REST_URL',
    'STORAGE_REST_URL',
    'REDIS_REST_URL',
  ])
}

function getRestToken(): string | undefined {
  return getFirstEnv([
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_TOKEN',
    'STORAGE_REST_TOKEN',
    'REDIS_REST_TOKEN',
  ])
}

function getRedisConnectionUrl(): string | undefined {
  return getFirstEnv([
    'KV_REST_API_REDIS_URL',
    'REDIS_URL',
    'KV_URL',
    'UPSTASH_REDIS_URL',
    'STORAGE_URL',
  ])
}

function getSupabaseUrl(): string | undefined {
  return getFirstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
}

function getSupabaseServiceRoleKey(): string | undefined {
  return getFirstEnv(['SUPABASE_SERVICE_ROLE_KEY'])
}

function getStorageBackend(): StorageBackend {
  if (getSupabaseUrl() && getSupabaseServiceRoleKey()) {
    return 'supabase'
  }

  if (getRestUrl() && getRestToken()) {
    return 'kv-rest'
  }

  if (getRedisConnectionUrl()) {
    return 'kv-redis-url'
  }

  return 'file'
}

function assertDurableStorage(backend: StorageBackend): void {
  if (backend !== 'file') {
    return
  }

  if (!shouldRequireDurableStorage()) {
    return
  }

  throw new Error(
    'Storage persistente de usuarios nao configurado. Em deploy Vercel, conecte Supabase ou Redis/KV antes de usar login/admin.'
  )
}

function canUseLocalFileFallback(): boolean {
  return !shouldRequireDurableStorage()
}

function getRedisClient(): Redis {
  if (!redisClient) {
    const restUrl = getRestUrl()
    const restToken = getRestToken()

    if (restUrl && restToken) {
      redisClient = new Redis({ url: restUrl, token: restToken })
    } else {
      redisClient = Redis.fromEnv()
    }
  }

  return redisClient
}

function getRedisUrl(): string {
  const url = getRedisConnectionUrl()
  if (!url) {
    throw new Error('URL do Redis nao configurada (KV_REST_API_REDIS_URL/REDIS_URL/KV_URL/UPSTASH_REDIS_URL/STORAGE_URL)')
  }

  return url
}

async function getRedisUrlClient(): Promise<RedisClientType> {
  if (!redisUrlClient) {
    redisUrlClient = createRedisClient({ url: getRedisUrl() })
  }

  if (!redisUrlClient.isOpen) {
    if (!redisUrlConnecting) {
      redisUrlConnecting = redisUrlClient.connect().finally(() => {
        redisUrlConnecting = null
      })
    }

    await redisUrlConnecting
  }

  return redisUrlClient
}

function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const url = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase nao configurado (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)')
  }

  supabaseClient = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return supabaseClient
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

function hasCourtesyAccess(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === COURTESY_ACCESS_EMAIL
}

function buildCourtesyPlanExpiresAtIso(): string {
  const expiresAt = Date.now() + COURTESY_ACCESS_DURATION_DAYS * 24 * 60 * 60 * 1000
  return new Date(expiresAt).toISOString()
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    username: user.username,
    email: user.email ?? (isValidEmail(user.username) ? user.username : null),
    role: user.role,
    active: user.active,
    telegramChatId: user.telegramChatId,
    telegramLinkedAt: user.telegramLinkedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    planType: user.planType ?? null,
    planExpiresAt: user.planExpiresAt ?? null,
    planActivatedAt: user.planActivatedAt ?? null,
  }
}

function normalizeStoredUser(entry: StoredUser): StoredUser {
  const rawEmail = (entry as StoredUser & { email?: unknown }).email
  const normalizedEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : null

  return {
    ...entry,
    username: entry.username.trim().toLowerCase(),
    email: normalizedEmail || (isValidEmail(entry.username) ? entry.username.trim().toLowerCase() : null),
    telegramChatId: entry.telegramChatId ? String(entry.telegramChatId).trim() : null,
    telegramLinkedAt: entry.telegramLinkedAt ?? null,
  }
}

function isStoredUser(entry: unknown): entry is StoredUser {
  if (!entry || typeof entry !== 'object') {
    return false
  }

  const candidate = entry as Partial<StoredUser>
  return Boolean(
    typeof candidate.username === 'string' &&
      (typeof candidate.email === 'string' || candidate.email === null || candidate.email === undefined) &&
      (candidate.role === 'admin' || candidate.role === 'user') &&
      typeof candidate.salt === 'string' &&
      typeof candidate.passwordHash === 'string' &&
      typeof candidate.active === 'boolean' &&
      (typeof candidate.telegramChatId === 'string' || candidate.telegramChatId === null || candidate.telegramChatId === undefined) &&
      (typeof candidate.telegramLinkedAt === 'string' || candidate.telegramLinkedAt === null || candidate.telegramLinkedAt === undefined) &&
      typeof candidate.createdAt === 'string' &&
      typeof candidate.updatedAt === 'string'
  )
}

function isExampleSeedUsers(entries: SeedUser[]): boolean {
  if (entries.length !== 2) {
    return false
  }

  const normalized = entries
    .map((entry) => `${entry.username}:${entry.password}`)
    .sort()

  return (
    normalized[0] === 'cliente1:SenhaForte123' &&
    normalized[1] === 'cliente2:OutraSenha456'
  )
}

function hasOnlyBootstrapAndExampleUsers(users: StoredUser[]): boolean {
  const usernames = users.map((user) => user.username).sort()

  return (
    usernames.length === 3 &&
    usernames.includes('cliente1') &&
    usernames.includes('cliente2')
  )
}

function parseSeedUsers(raw: string | undefined): SeedUser[] {
  if (!raw) {
    return []
  }

  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf(':')
      if (sep <= 0) {
        return null
      }

      const username = entry.slice(0, sep).trim().toLowerCase()
      const password = entry.slice(sep + 1).trim()
      if (!username || !password) {
        return null
      }

      return { username, password }
    })
    .filter((entry): entry is SeedUser => Boolean(entry))

  if (isExampleSeedUsers(parsed)) {
    console.warn('[AUTH_USERS] Ignorando seeds de exemplo cliente1/cliente2')
    return []
  }

  return parsed
}

async function saveStoreToFile(store: UserStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const tmpFile = `${USERS_FILE}.tmp`
  await writeFile(tmpFile, JSON.stringify(store, null, 2), 'utf8')
  await rename(tmpFile, USERS_FILE)
}

async function saveStoreToKv(store: UserStore): Promise<void> {
  await getRedisClient().set(KV_USERS_KEY, store)
}

async function saveStoreToRedisUrl(store: UserStore): Promise<void> {
  const client = await getRedisUrlClient()
  await client.set(KV_USERS_KEY, JSON.stringify(store))
}

async function saveStoreToSupabase(store: UserStore): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client
    .from(SUPABASE_STORAGE_TABLE)
    .upsert(
      {
        key: KV_USERS_KEY,
        value: store,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

  if (error) {
    throw new Error(`Falha ao salvar no Supabase: ${error.message}`)
  }
}

async function saveStore(store: UserStore, backend: StorageBackend): Promise<void> {
  if (backend === 'supabase') {
    await saveStoreToSupabase(store)
    return
  }

  if (backend === 'kv-rest') {
    await saveStoreToKv(store)
    return
  }

  if (backend === 'kv-redis-url') {
    await saveStoreToRedisUrl(store)
    return
  }

  await saveStoreToFile(store)
}

async function initializeStore(backend: StorageBackend): Promise<UserStore> {
  const now = new Date().toISOString()
  const seedUsers = parseSeedUsers(process.env.AUTH_USERS)
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'thiago@sagacy.com.br').trim().toLowerCase()
  const adminPassword = (process.env.ADMIN_PASSWORD ?? '').trim()

  const users: StoredUser[] = []

  if (adminEmail && adminPassword) {
    const salt = randomBytes(16).toString('hex')
    users.push({
      username: adminEmail,
      email: adminEmail,
      role: 'admin',
      salt,
      passwordHash: hashPassword(adminPassword, salt),
      active: true,
      telegramChatId: null,
      telegramLinkedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const seed of seedUsers) {
    if (users.some((existing) => existing.username === seed.username)) {
      continue
    }

    const salt = randomBytes(16).toString('hex')
    users.push({
      username: seed.username,
      email: seed.username,
      role: seed.username === adminEmail ? 'admin' : 'user',
      salt,
      passwordHash: hashPassword(seed.password, salt),
      active: true,
      telegramChatId: null,
      telegramLinkedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (users.length === 0) {
    throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de iniciar o sistema.')
  }

  const store = { users }
  await saveStore(store, backend)
  return store
}

async function loadStoreFromFile(): Promise<UserStore> {
  try {
    const raw = await readFile(USERS_FILE, 'utf8')
    const store = JSON.parse(raw) as UserStore

    if (!Array.isArray(store.users)) {
      throw new Error('Formato de users.json invalido')
    }

    return store
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('ENOENT')) {
      // No Vercel o /tmp é efêmero. Tenta usar o data/users.json do repositório como seed.
      if (process.env.VERCEL) {
        try {
          const raw = await readFile(BUNDLED_USERS_FILE, 'utf8')
          const store = JSON.parse(raw) as UserStore
          if (Array.isArray(store.users) && store.users.length > 0) {
            if (hasOnlyBootstrapAndExampleUsers(store.users)) {
              console.warn('[BOOTSTRAP] Ignorando users.json bundled com usuarios de exemplo')
              return initializeStore('file')
            }
            console.log('[BOOTSTRAP] Carregando users.json do repositório para /tmp')
            await saveStoreToFile(store)
            return store
          }
        } catch {
          // sem arquivo bundled, cai para initializeStore
        }
      }
      return initializeStore('file')
    }

    throw error
  }
}

async function loadStoreFromKv(): Promise<UserStore> {
  let store: UserStore | null = null
  try {
    store = await getRedisClient().get<UserStore>(KV_USERS_KEY)
  } catch (err) {
    if (!canUseLocalFileFallback()) {
      throw new Error('Falha ao conectar no storage persistente (KV REST)')
    }

    console.error('[KV-REST] Falha ao conectar, usando fallback de arquivo:', err)
    return loadStoreFromFile()
  }

  if (!store || !Array.isArray(store.users)) {
    // Se não tem dados no Redis, tenta sincronizar do arquivo local (para Vercel deploys)
    if (process.env.VERCEL && canUseLocalFileFallback()) {
      try {
        const fileData = await readFile(USERS_FILE, 'utf8')
        const fileStore = JSON.parse(fileData) as UserStore
        if (Array.isArray(fileStore.users) && fileStore.users.length > 0) {
          // Sincroniza arquivo local para Redis
          console.log('[SYNC] Importando users.json local para KV')
          await getRedisClient().set(KV_USERS_KEY, fileStore)
          return fileStore
        }
      } catch (err) {
        // Arquivo não existe ou é inválido, continua com inicialização
        console.log('[SYNC] Não há arquivo local para sincronizar')
      }
    }
    return initializeStore('kv-rest')
  }

  return store
}

async function loadStoreFromSupabase(): Promise<UserStore> {
  const client = getSupabaseClient()

  const { data, error } = await client
    .from(SUPABASE_STORAGE_TABLE)
    .select('value')
    .eq('key', KV_USERS_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao ler no Supabase: ${error.message}`)
  }

  if (!data || !('value' in data)) {
    return initializeStore('supabase')
  }

  const store = (data as { value: unknown }).value as UserStore
  if (!store || !Array.isArray(store.users)) {
    return initializeStore('supabase')
  }

  return store
}

async function loadStoreFromRedisUrl(): Promise<UserStore> {
  let client: RedisClientType
  try {
    client = await getRedisUrlClient()
  } catch (err) {
    if (!canUseLocalFileFallback()) {
      throw new Error('Falha ao conectar no storage persistente (REDIS_URL)')
    }

    console.error('[REDIS-URL] Falha ao conectar, usando fallback de arquivo:', err)
    return loadStoreFromFile()
  }

  let raw: string | null = null
  try {
    raw = await client.get(KV_USERS_KEY)
  } catch (err) {
    if (!canUseLocalFileFallback()) {
      throw new Error('Falha ao ler usuarios no storage persistente (REDIS_URL)')
    }

    console.error('[REDIS-URL] Falha ao ler chave, usando fallback de arquivo:', err)
    return loadStoreFromFile()
  }

  if (!raw || typeof raw !== 'string') {
    // Se não tem dados no Redis, tenta sincronizar do arquivo local (para Vercel deploys)
    if (process.env.VERCEL && canUseLocalFileFallback()) {
      try {
        const fileData = await readFile(USERS_FILE, 'utf8')
        const fileStore = JSON.parse(fileData) as UserStore
        if (Array.isArray(fileStore.users) && fileStore.users.length > 0) {
          // Sincroniza arquivo local para Redis
          console.log('[SYNC] Importando users.json local para Redis')
          await client.set(KV_USERS_KEY, JSON.stringify(fileStore))
          return fileStore
        }
      } catch (err) {
        // Arquivo não existe ou é inválido, continua com inicialização
        console.log('[SYNC] Não há arquivo local para sincronizar')
      }
    }
    return initializeStore('kv-redis-url')
  }

  const store = JSON.parse(raw) as UserStore
  if (!Array.isArray(store.users)) {
    return initializeStore('kv-redis-url')
  }

  return store
}

async function loadStore(): Promise<UserStore> {
  const backend = getStorageBackend()
  assertDurableStorage(backend)
  let store: UserStore

  if (backend === 'supabase') {
    store = await loadStoreFromSupabase()
    return ensureBootstrapAdmin(store)
  }

  if (backend === 'kv-rest') {
    store = await loadStoreFromKv()
    return ensureBootstrapAdmin(store)
  }

  if (backend === 'kv-redis-url') {
    store = await loadStoreFromRedisUrl()
    return ensureBootstrapAdmin(store)
  }

  store = await loadStoreFromFile()
  return ensureBootstrapAdmin(store)
}

async function ensureBootstrapAdmin(store: UserStore): Promise<UserStore> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'thiago@sagacy.com.br').trim().toLowerCase()
  const adminPassword = (process.env.ADMIN_PASSWORD ?? '').trim()

  if (!adminEmail || !adminPassword) {
    return store
  }

  const now = new Date().toISOString()
  let changed = false
  const existing = store.users.find((entry) => entry.username === adminEmail)

  if (!existing) {
    const salt = randomBytes(16).toString('hex')
    store.users.push({
      username: adminEmail,
      email: adminEmail,
      role: 'admin',
      salt,
      passwordHash: hashPassword(adminPassword, salt),
      active: true,
      telegramChatId: null,
      telegramLinkedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    changed = true
  } else {
    if (existing.role !== 'admin') {
      existing.role = 'admin'
      changed = true
    }

    if (!existing.active) {
      existing.active = true
      changed = true
    }

    const expectedHash = hashPassword(adminPassword, existing.salt)
    if (existing.passwordHash !== expectedHash) {
      existing.passwordHash = expectedHash
      changed = true
    }

    if (changed) {
      existing.updatedAt = now
    }
  }

  if (changed) {
    await persistStore(store)
  }

  return store
}

async function persistStore(store: UserStore): Promise<void> {
  const backend = getStorageBackend()
  try {
    await saveStore(store, backend)
  } catch (error) {
    if (!canUseLocalFileFallback()) {
      console.error('[PERSIST] Falha no backend persistente:', error)
      throw new Error('Falha ao salvar usuarios no storage persistente configurado')
    }

    // Mantem o sistema funcional quando KV/Redis falha temporariamente.
    console.error('[PERSIST] Falha no backend principal, salvando em arquivo local:', error)
    await saveStoreToFile(store)
  }
}

export async function exportUsersBackup(): Promise<UserBackup> {
  const store = await loadStore()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    users: store.users,
  }
}

export async function restoreUsersBackup(backup: unknown): Promise<number> {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Backup invalido')
  }

  const payload = backup as Partial<UserBackup>
  const users = Array.isArray(payload.users) ? payload.users : null

  if (!users || users.length === 0) {
    throw new Error('Backup sem usuarios')
  }

  if (!users.every((entry) => isStoredUser(entry))) {
    throw new Error('Formato de backup invalido')
  }

  const normalizedUsers = users.map((entry) => normalizeStoredUser(entry))
  const admins = normalizedUsers.filter((entry) => entry.role === 'admin' && entry.active)

  if (admins.length === 0) {
    throw new Error('Backup precisa conter ao menos um admin ativo')
  }

  const dedupMap = new Map<string, StoredUser>()
  for (const user of normalizedUsers) {
    dedupMap.set(user.username, user)
  }

  const store: UserStore = { users: Array.from(dedupMap.values()) }
  await persistStore(store)
  return store.users.length
}

export async function listUsers(): Promise<PublicUser[]> {
  const store = await loadStore()
  return store.users.map(toPublicUser)
}

export async function createUser(input: {
  username: string
  password: string
  role?: UserRole
}): Promise<PublicUser> {
  const username = input.username.trim().toLowerCase()
  const password = input.password.trim()
  const role = input.role ?? 'user'

  if (!username || !password) {
    throw new Error('Usuario e senha sao obrigatorios')
  }

  if (!isValidEmail(username)) {
    throw new Error('Cadastro exige um email valido')
  }

  const store = await loadStore()

  if (store.users.some((user) => user.username === username)) {
    throw new Error('Usuario ja existe')
  }

  const now = new Date().toISOString()
  const salt = randomBytes(16).toString('hex')

  const created: StoredUser = {
    username,
    email: username,
    role,
    salt,
    passwordHash: hashPassword(password, salt),
    active: true,
    telegramChatId: null,
    telegramLinkedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  store.users.push(created)
  await persistStore(store)

  return toPublicUser(created)
}

export async function setUserActive(
  username: string,
  active: boolean,
  actorUsername: string
): Promise<PublicUser> {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedActor = actorUsername.trim().toLowerCase()

  if (!normalizedUsername) {
    throw new Error('Usuario invalido')
  }

  if (!active && normalizedUsername === normalizedActor) {
    throw new Error('Nao e permitido travar seu proprio usuario')
  }

  const store = await loadStore()
  const user = store.users.find((entry) => entry.username === normalizedUsername)

  if (!user) {
    throw new Error('Usuario nao encontrado')
  }

  if (user.active === active) {
    return toPublicUser(user)
  }

  if (user.role === 'admin' && !active) {
    const remainingAdmins = store.users.filter(
      (entry) => entry.username !== normalizedUsername && entry.role === 'admin' && entry.active
    )

    if (remainingAdmins.length === 0) {
      throw new Error('Nao e permitido travar o ultimo admin ativo')
    }
  }

  user.active = active
  user.updatedAt = new Date().toISOString()

  await persistStore(store)

  return toPublicUser(user)
}

export async function updateUserCredentials(input: {
  currentUsername: string
  nextUsername?: string
  password?: string
}): Promise<PublicUser> {
  const currentUsername = input.currentUsername.trim().toLowerCase()
  const nextUsername = input.nextUsername?.trim().toLowerCase()
  const password = input.password?.trim()

  if (!currentUsername) {
    throw new Error('Usuario invalido')
  }

  if (nextUsername === '') {
    throw new Error('Novo usuario invalido')
  }

  if (nextUsername && !isValidEmail(nextUsername)) {
    throw new Error('Novo usuario deve ser um email valido')
  }

  if (!nextUsername && !password) {
    throw new Error('Informe um novo usuario ou uma nova senha')
  }

  const store = await loadStore()
  const user = store.users.find((entry) => entry.username === currentUsername)

  if (!user) {
    throw new Error('Usuario nao encontrado')
  }

  const normalizedNextUsername = nextUsername ?? currentUsername
  if (
    normalizedNextUsername !== currentUsername &&
    store.users.some((entry) => entry.username === normalizedNextUsername)
  ) {
    throw new Error('Novo usuario ja existe')
  }

  let changed = false

  if (normalizedNextUsername !== user.username) {
    user.username = normalizedNextUsername
    user.email = normalizedNextUsername
    changed = true
  }

  if (password) {
    const salt = randomBytes(16).toString('hex')
    user.salt = salt
    user.passwordHash = hashPassword(password, salt)
    changed = true
  }

  if (!changed) {
    return toPublicUser(user)
  }

  user.updatedAt = new Date().toISOString()
  await persistStore(store)

  return toPublicUser(user)
}

export async function deleteUser(username: string, actorUsername: string): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase()
  const normalizedActor = actorUsername.trim().toLowerCase()

  if (!normalizedUsername) {
    throw new Error('Usuario invalido')
  }

  if (normalizedUsername === normalizedActor) {
    throw new Error('Nao e permitido remover seu proprio usuario')
  }

  const store = await loadStore()

  const beforeCount = store.users.length
  const remaining = store.users.filter((user) => user.username !== normalizedUsername)

  if (remaining.length === beforeCount) {
    throw new Error('Usuario nao encontrado')
  }

  const remainingAdmins = remaining.filter((user) => user.role === 'admin' && user.active)
  if (remainingAdmins.length === 0) {
    throw new Error('Nao e permitido remover o ultimo admin')
  }

  store.users = remaining
  await persistStore(store)
}

export async function activateUserPlan(
  username: string,
  planType: PlanType,
  paymentId: string
): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase()
  const store = await loadStore()
  const user = store.users.find((entry) => entry.username === normalizedUsername)

  if (!user) {
    throw new Error(`Usuario nao encontrado: ${normalizedUsername}`)
  }

  const now = new Date()
  const daysToAdd = planType === 'weekly' ? 7 : 30
  const expiresAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000)

  user.active = true
  user.planType = planType
  user.planExpiresAt = expiresAt.toISOString()
  user.planActivatedAt = now.toISOString()
  user.planPaymentId = paymentId
  user.updatedAt = now.toISOString()

  await persistStore(store)
}

export async function createPendingUser(input: {
  email: string
  password: string
}): Promise<void> {
  const username = input.email.trim().toLowerCase()
  const password = input.password.trim()

  if (!username || !password) {
    throw new Error('Email e senha sao obrigatorios')
  }

  if (!EMAIL_PATTERN.test(username)) {
    throw new Error('Email invalido')
  }

  if (password.length < 6) {
    throw new Error('Senha deve ter ao menos 6 caracteres')
  }

  const store = await loadStore()

  if (store.users.some((user) => user.username === username)) {
    // Usuário já existe, não é erro - apenas não recria
    return
  }

  const now = new Date().toISOString()
  const salt = randomBytes(16).toString('hex')

  const pending: StoredUser = {
    username,
    email: username,
    role: 'user',
    salt,
    passwordHash: hashPassword(password, salt),
    active: false, // inativo até o pagamento ser confirmado
    telegramChatId: null,
    telegramLinkedAt: null,
    createdAt: now,
    updatedAt: now,
    planType: null,
    planExpiresAt: null,
    planActivatedAt: null,
    planPaymentId: null,
  }

  store.users.push(pending)
  await persistStore(store)
}

export async function getUserPlanInfo(
  username: string
): Promise<{ planType: PlanType | null; planExpiresAt: string | null; planActive: boolean }> {
  const normalizedUsername = username.trim().toLowerCase()
  const store = await loadStore()
  const user = store.users.find((entry) => entry.username === normalizedUsername)

  if (!user) {
    return { planType: null, planExpiresAt: null, planActive: false }
  }

  if (user.role === 'admin') {
    return { planType: null, planExpiresAt: null, planActive: true }
  }

  if (hasCourtesyAccess(user.email ?? user.username)) {
    return {
      planType: user.planType ?? 'monthly',
      planExpiresAt: buildCourtesyPlanExpiresAtIso(),
      planActive: true,
    }
  }

  const planExpiresAt = user.planExpiresAt ?? null
  const planActive =
    planExpiresAt !== null && new Date(planExpiresAt).getTime() > Date.now()

  return { planType: user.planType ?? null, planExpiresAt, planActive }
}

export async function verifyUserCredentials(username: string, password: string): Promise<PublicUser | null> {
  const normalizedUsername = username.trim().toLowerCase()
  const store = await loadStore()

  const user = store.users.find((entry) => entry.username === normalizedUsername)
  if (!user) {
    return null
  }

  if (!user.active && !hasCourtesyAccess(user.email ?? user.username)) {
    return null
  }

  const attemptedHash = hashPassword(password, user.salt)
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = Buffer.from(attemptedHash, 'hex')

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  return toPublicUser(user)
}

export async function getUserByTelegramChatId(chatId: number | string): Promise<PublicUser | null> {
  const normalizedChatId = String(chatId).trim()
  if (!normalizedChatId) {
    return null
  }

  const store = await loadStore()
  const user = store.users.find((entry) => entry.telegramChatId === normalizedChatId && entry.active)
  return user ? toPublicUser(user) : null
}

export async function linkTelegramChatToUser(input: {
  username: string
  password: string
  chatId: number | string
}): Promise<PublicUser | null> {
  const normalizedUsername = input.username.trim().toLowerCase()
  const normalizedChatId = String(input.chatId).trim()
  const password = input.password.trim()

  if (!normalizedUsername || !password || !normalizedChatId) {
    return null
  }

  const store = await loadStore()
  const user = store.users.find((entry) => entry.username === normalizedUsername)
  if (!user || !user.active) {
    return null
  }

  const attemptedHash = hashPassword(password, user.salt)
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = Buffer.from(attemptedHash, 'hex')

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  const now = new Date().toISOString()
  let changed = false

  for (const entry of store.users) {
    if (entry.telegramChatId === normalizedChatId && entry.username !== user.username) {
      entry.telegramChatId = null
      entry.telegramLinkedAt = null
      entry.updatedAt = now
      changed = true
    }
  }

  if (user.telegramChatId !== normalizedChatId || user.telegramLinkedAt === null) {
    user.telegramChatId = normalizedChatId
    user.telegramLinkedAt = now
    user.updatedAt = now
    changed = true
  }

  if (changed) {
    await persistStore(store)
  }

  return toPublicUser(user)
}

export async function registerTelegramUser(input: {
  username: string
  password: string
  chatId: number | string
}): Promise<PublicUser> {
  const username = input.username.trim().toLowerCase()
  const password = input.password.trim()
  const normalizedChatId = String(input.chatId).trim()

  if (!username || !password || !normalizedChatId) {
    throw new Error('Usuario, senha e chat sao obrigatorios')
  }

  const created = await createUser({ username, password, role: 'user' })
  const linked = await linkTelegramChatToUser({ username, password, chatId: normalizedChatId })
  return linked ?? created
}

export async function unlinkTelegramChat(chatId: number | string): Promise<void> {
  const normalizedChatId = String(chatId).trim()
  if (!normalizedChatId) {
    return
  }

  const store = await loadStore()
  const now = new Date().toISOString()
  let changed = false

  for (const user of store.users) {
    if (user.telegramChatId !== normalizedChatId) continue
    user.telegramChatId = null
    user.telegramLinkedAt = null
    user.updatedAt = now
    changed = true
  }

  if (changed) {
    await persistStore(store)
  }
}
