import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import path from 'path'

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

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

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

async function saveStore(store: UserStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const tmpFile = `${USERS_FILE}.tmp`
  await writeFile(tmpFile, JSON.stringify(store, null, 2), 'utf8')
  await rename(tmpFile, USERS_FILE)
}

async function initializeStore(): Promise<UserStore> {
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
  await saveStore(store)
  return store
}

async function loadStore(): Promise<UserStore> {
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
      return initializeStore()
    }

    throw error
  }
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
  await saveStore(store)

  return toPublicUser(created)
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
  await saveStore(store)
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
