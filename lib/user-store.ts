import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'
import { Redis } from '@upstash/redis'
import { createClient, type RedisClientType } from 'redis'

export type UserRole = 'admin' | 'user'

type StoredUser = {
  username: string
  role: UserRole
  salt: string
  passwordHash: string
  active: boolean
  createdAt: string
  updatedAt: string
}

type UserStore = {
  users: StoredUser[]
}

export type PublicUser = {
  username: string
  role: UserRole
  active: boolean
  createdAt: string
  updatedAt: string
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'usdtbot')
  : path.join(process.cwd(), 'data')
const BUNDLED_USERS_FILE = path.join(process.cwd(), 'data', 'users.json')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const KV_USERS_KEY = 'usdtbot:users:v1'

type StorageBackend = 'file' | 'kv-rest' | 'kv-redis-url'

let redisClient: Redis | null = null
let redisUrlClient: RedisClientType | null = null
let redisUrlConnecting: Promise<RedisClientType> | null = null

function getStorageBackend(): StorageBackend {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return 'kv-rest'
  }

  if (process.env.KV_REST_API_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL) {
    return 'kv-redis-url'
  }

  return 'file'
}

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }

  return redisClient
}

function getRedisUrl(): string {
  const url = process.env.KV_REST_API_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL
  if (!url) {
    throw new Error('URL do Redis nao configurada')
  }

  return url
}

async function getRedisUrlClient(): Promise<RedisClientType> {
  if (!redisUrlClient) {
    redisUrlClient = createClient({ url: getRedisUrl() })
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

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    username: user.username,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

function parseSeedUsers(raw: string | undefined): Array<{ username: string; password: string }> {
  if (!raw) {
    return []
  }

  return raw
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
    .filter((entry): entry is { username: string; password: string } => Boolean(entry))
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

async function saveStore(store: UserStore, backend: StorageBackend): Promise<void> {
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
      role: 'admin',
      salt,
      passwordHash: hashPassword(adminPassword, salt),
      active: true,
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
      role: seed.username === adminEmail ? 'admin' : 'user',
      salt,
      passwordHash: hashPassword(seed.password, salt),
      active: true,
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
  const store = await getRedisClient().get<UserStore>(KV_USERS_KEY)

  if (!store || !Array.isArray(store.users)) {
    // Se não tem dados no Redis, tenta sincronizar do arquivo local (para Vercel deploys)
    if (process.env.VERCEL) {
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

async function loadStoreFromRedisUrl(): Promise<UserStore> {
  const client = await getRedisUrlClient()
  const raw = await client.get(KV_USERS_KEY)

  if (!raw || typeof raw !== 'string') {
    // Se não tem dados no Redis, tenta sincronizar do arquivo local (para Vercel deploys)
    if (process.env.VERCEL) {
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

  if (backend === 'kv-rest') {
    return loadStoreFromKv()
  }

  if (backend === 'kv-redis-url') {
    return loadStoreFromRedisUrl()
  }

  return loadStoreFromFile()
}

async function persistStore(store: UserStore): Promise<void> {
  const backend = getStorageBackend()
  await saveStore(store, backend)
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

  const store = await loadStore()

  if (store.users.some((user) => user.username === username)) {
    throw new Error('Usuario ja existe')
  }

  const now = new Date().toISOString()
  const salt = randomBytes(16).toString('hex')

  const created: StoredUser = {
    username,
    role,
    salt,
    passwordHash: hashPassword(password, salt),
    active: true,
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

export async function verifyUserCredentials(username: string, password: string): Promise<PublicUser | null> {
  const normalizedUsername = username.trim().toLowerCase()
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

  return toPublicUser(user)
}
