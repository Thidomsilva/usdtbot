import { promises as fs } from 'fs'
import path from 'path'
import { Redis } from '@upstash/redis'
import { createClient as createRedisClient, type RedisClientType } from 'redis'
import { listUsers } from './user-store'

export type ActivityType = 'login' | 'logout' | 'page_access' | 'api_call'

export interface ActivityLog {
  id: string
  username: string
  email?: string | null
  userRole: 'admin' | 'user'
  activityType: ActivityType
  path: string
  method?: string
  timestamp: string
  lastActivityAt?: string
}

export interface UserActivity {
  username: string
  role: 'admin' | 'user'
  lastLogin?: string
  lastActivity?: string
  totalAccess: number
  accessHistory: Array<{
    path: string
    timestamp: string
    activityType: ActivityType
  }>
}

// Cache em memória para ambientes sem fs (como Vercel)
const memoryCache = {
  logs: [] as ActivityLog[],
  sessions: [] as Array<{
    username: string
    email: string | null
    role: 'admin' | 'user'
    loginAt: string
    lastActivityAt: string
    logoutAt?: string
  }>,
}

type ActivityStorePayload = { logs: ActivityLog[] }
type SessionStorePayload = { sessions: SessionRecord[] }
type ActivityStorageBackend = 'kv-rest' | 'kv-redis-url' | 'file'

// Verificar se estamos em um ambiente onde fs está disponível (Node.js)
const canUseFsModule = (): boolean => {
  try {
    return typeof process !== 'undefined' && process.env.NODE_ENV !== undefined
  } catch {
    return false
  }
}

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'usdtbot')
  : path.join(process.cwd(), 'data')
const LOGS_FILE = path.join(DATA_DIR, 'activity-logs.json')
const SESSIONS_FILE = path.join(DATA_DIR, 'user-sessions.json')
const KV_LOGS_KEY = 'usdtbot:activity-logs:v1'
const KV_SESSIONS_KEY = 'usdtbot:user-sessions:v1'

let redisClient: Redis | null = null
let redisUrlClient: RedisClientType | null = null
let redisUrlConnecting: Promise<RedisClientType> | null = null

type SessionRecord = {
  username: string
  email: string | null
  role: 'admin' | 'user'
  loginAt: string
  lastActivityAt: string
  logoutAt?: string
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

function canUseKvRest(): boolean {
  return Boolean(getRestUrl() && getRestToken())
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

function canUseRedisUrl(): boolean {
  return Boolean(getRedisConnectionUrl())
}

function getStorageBackend(): ActivityStorageBackend {
  if (canUseKvRest()) {
    return 'kv-rest'
  }

  if (canUseRedisUrl()) {
    return 'kv-redis-url'
  }

  return 'file'
}

function getRedisClient(): Redis {
  if (!redisClient) {
    const restUrl = getRestUrl()
    const restToken = getRestToken()
    if (!restUrl || !restToken) {
      throw new Error('KV REST nao configurado')
    }
    redisClient = new Redis({ url: restUrl, token: restToken })
  }

  return redisClient
}

async function getRedisUrlClient(): Promise<RedisClientType> {
  if (!redisUrlClient) {
    const redisUrl = getRedisConnectionUrl()
    if (!redisUrl) {
      throw new Error('REDIS URL nao configurada')
    }

    redisUrlClient = createRedisClient({ url: redisUrl })
  }

  if (!redisUrlClient.isOpen) {
    if (!redisUrlConnecting) {
      redisUrlConnecting = redisUrlClient.connect().then(() => redisUrlClient as RedisClientType).finally(() => {
        redisUrlConnecting = null
      })
    }
    await redisUrlConnecting
  }

  return redisUrlClient
}

function dedupeLogs(logs: ActivityLog[]): ActivityLog[] {
  const seen = new Set<string>()
  return logs.filter((log) => {
    if (seen.has(log.id)) return false
    seen.add(log.id)
    return true
  })
}

function dedupeSessions(sessions: SessionRecord[]): SessionRecord[] {
  const sessionMap = new Map<string, SessionRecord>()
  sessions.forEach((session) => {
    const key = `${session.username}:${session.loginAt}`
    sessionMap.set(key, session)
  })
  return Array.from(sessionMap.values())
}

function findLatestOpenSession(sessions: SessionRecord[], username: string): SessionRecord | undefined {
  return sessions
    .filter((session) => session.username === username && !session.logoutAt)
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime())[0]
}

async function loadLogsFromStore(): Promise<ActivityLog[]> {
  const backend = getStorageBackend()

  if (backend === 'kv-rest') {
    const data = await getRedisClient().get<ActivityStorePayload>(KV_LOGS_KEY)
    return Array.isArray(data?.logs) ? data.logs : []
  }

  if (backend === 'kv-redis-url') {
    const client = await getRedisUrlClient()
    const raw = await client.get(KV_LOGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ActivityStorePayload
    return Array.isArray(parsed.logs) ? parsed.logs : []
  }

  if (canUseFsModule()) {
    await ensureLogsFile()
    const data = await fs.readFile(LOGS_FILE, 'utf-8')
    const parsed = JSON.parse(data) as ActivityStorePayload
    return Array.isArray(parsed.logs) ? parsed.logs : []
  }

  return []
}

async function saveLogsToStore(logs: ActivityLog[]): Promise<void> {
  const backend = getStorageBackend()

  if (backend === 'kv-rest') {
    await getRedisClient().set(KV_LOGS_KEY, { logs })
    return
  }

  if (backend === 'kv-redis-url') {
    const client = await getRedisUrlClient()
    await client.set(KV_LOGS_KEY, JSON.stringify({ logs }))
    return
  }

  if (canUseFsModule()) {
    await ensureLogsFile()
    await fs.writeFile(LOGS_FILE, JSON.stringify({ logs }, null, 2))
  }
}

async function loadSessionsFromStore(): Promise<SessionRecord[]> {
  const backend = getStorageBackend()

  if (backend === 'kv-rest') {
    const data = await getRedisClient().get<SessionStorePayload>(KV_SESSIONS_KEY)
    return Array.isArray(data?.sessions) ? data.sessions : []
  }

  if (backend === 'kv-redis-url') {
    const client = await getRedisUrlClient()
    const raw = await client.get(KV_SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SessionStorePayload
    return Array.isArray(parsed.sessions) ? parsed.sessions : []
  }

  if (canUseFsModule()) {
    await ensureSessionsFile()
    const data = await fs.readFile(SESSIONS_FILE, 'utf-8')
    const parsed = JSON.parse(data) as SessionStorePayload
    return Array.isArray(parsed.sessions) ? parsed.sessions : []
  }

  return []
}

async function saveSessionsToStore(sessions: SessionRecord[]): Promise<void> {
  const backend = getStorageBackend()

  if (backend === 'kv-rest') {
    await getRedisClient().set(KV_SESSIONS_KEY, { sessions })
    return
  }

  if (backend === 'kv-redis-url') {
    const client = await getRedisUrlClient()
    await client.set(KV_SESSIONS_KEY, JSON.stringify({ sessions }))
    return
  }

  if (canUseFsModule()) {
    await ensureSessionsFile()
    await fs.writeFile(SESSIONS_FILE, JSON.stringify({ sessions }, null, 2))
  }
}

async function buildEmailLookup(): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()

  try {
    const users = await listUsers()
    const adminEmail = users.find((user) => user.role === 'admin' && user.email)?.email ?? null

    if (adminEmail) {
      lookup.set('admin', adminEmail)
    }

    for (const user of users) {
      if (user.email) {
        lookup.set(user.username, user.email)
      }
    }
  } catch {
    // Se o cadastro de usuários falhar, seguimos sem email resolvido.
  }

  return lookup
}

async function ensureLogsFile() {
  if (!canUseFsModule()) return

  try {
    await fs.access(LOGS_FILE)
  } catch {
    await fs.mkdir(path.dirname(LOGS_FILE), { recursive: true })
    await fs.writeFile(LOGS_FILE, JSON.stringify({ logs: [] }, null, 2))
  }
}

async function ensureSessionsFile() {
  if (!canUseFsModule()) return

  try {
    await fs.access(SESSIONS_FILE)
  } catch {
    await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true })
    await fs.writeFile(SESSIONS_FILE, JSON.stringify({ sessions: [] }, null, 2))
  }
}

export async function logActivity(
  username: string,
  userRole: 'admin' | 'user',
  activityType: ActivityType,
  path: string,
  method?: string
): Promise<void> {
  try {
    const activity: ActivityLog = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      username,
      userRole,
      activityType,
      path,
      method,
      timestamp: new Date().toISOString(),
    }

    // Adicionar ao cache em memória
    memoryCache.logs.push(activity)
    if (memoryCache.logs.length > 10000) {
      memoryCache.logs = memoryCache.logs.slice(-10000)
    }

    try {
      const storedLogs = await loadLogsFromStore()
      const nextLogs = dedupeLogs([...storedLogs, activity]).slice(-10000)
      await saveLogsToStore(nextLogs)
    } catch (error) {
      console.error('[ACTIVITY LOG] Erro ao salvar em storage:', error)
    }
  } catch (error) {
    console.error('[ACTIVITY LOG] Erro ao registrar atividade:', error)
  }
}

export async function recordUserSession(
  username: string,
  userRole: 'admin' | 'user',
  action: 'login' | 'logout' | 'activity',
  email?: string | null
): Promise<void> {
  try {
    const now = new Date().toISOString()

    if (action === 'login') {
      memoryCache.sessions.push({
        username,
        email: email ?? null,
        role: userRole,
        loginAt: now,
        lastActivityAt: now,
      })
    } else if (action === 'logout') {
      const session = findLatestOpenSession(memoryCache.sessions, username)
      if (session) {
        session.logoutAt = now
      }
    } else if (action === 'activity') {
      const session = findLatestOpenSession(memoryCache.sessions, username)
      if (session) {
        session.lastActivityAt = now
      } else {
        // Recupera sessao quando o usuario ja estava autenticado, mas sem registro local.
        memoryCache.sessions.push({
          username,
          email: email ?? null,
          role: userRole,
          loginAt: now,
          lastActivityAt: now,
        })
      }
    }

    if (memoryCache.sessions.length > 1000) {
      memoryCache.sessions = memoryCache.sessions.slice(-1000)
    }

    try {
      const storedSessions = await loadSessionsFromStore()
      const nextSessions = [...storedSessions]

      if (action === 'login') {
        nextSessions.push({
          username,
          email: email ?? null,
          role: userRole,
          loginAt: now,
          lastActivityAt: now,
        })
      } else if (action === 'logout') {
        const session = findLatestOpenSession(nextSessions, username)
        if (session) {
          session.logoutAt = now
        }
      } else if (action === 'activity') {
        const session = findLatestOpenSession(nextSessions, username)
        if (session) {
          session.lastActivityAt = now
        } else {
          // Se nao houver sessao aberta no storage, cria uma para manter online em sincronia.
          nextSessions.push({
            username,
            email: email ?? null,
            role: userRole,
            loginAt: now,
            lastActivityAt: now,
          })
        }
      }

      const compactedSessions = dedupeSessions(nextSessions).slice(-1000)
      await saveSessionsToStore(compactedSessions)
    } catch (error) {
      console.error('[SESSION LOG] Erro ao salvar em storage:', error)
    }
  } catch (error) {
    console.error('[SESSION LOG] Erro ao registrar sessão:', error)
  }
}

export async function getActivityLogs(
  limit: number = 500,
  username?: string
): Promise<ActivityLog[]> {
  try {
    let logs = [...memoryCache.logs]

    try {
      const storedLogs = await loadLogsFromStore()
      logs = dedupeLogs([...storedLogs, ...memoryCache.logs])
    } catch {
      // Usar apenas cache se falhar
    }

    if (username) {
      logs = logs.filter((log) => log.username === username)
    }

    const emailLookup = await buildEmailLookup()

    return logs
      .slice(-limit)
      .reverse()
      .map((log) => ({
        ...log,
        email: emailLookup.get(log.username) ?? log.email ?? null,
      }))
  } catch {
    return []
  }
}

export async function getUserSessions(): Promise<
  Array<SessionRecord & { isActive: boolean; sessionDuration: string }>
> {
  try {
    let sessions = [...memoryCache.sessions]

    try {
      const storedSessions = await loadSessionsFromStore()
      const normalizedSessions: SessionRecord[] = storedSessions.map((session) => ({
        username: session.username,
        email: session.email ?? null,
        role: session.role,
        loginAt: session.loginAt,
        lastActivityAt: session.lastActivityAt,
        logoutAt: session.logoutAt,
      }))
      sessions = dedupeSessions([
        ...normalizedSessions,
        ...memoryCache.sessions.map((s) => ({ ...s, email: s.email ?? null })),
      ])
    } catch {
      // Usar apenas cache se falhar
    }

    const now = Date.now()
    const THREE_HOURS = 3 * 60 * 60 * 1000
    const emailLookup = await buildEmailLookup()

    return sessions.map((session) => {
      const loginTime = new Date(session.loginAt).getTime()
      const lastActivityTime = new Date(session.lastActivityAt).getTime()
      const isActive = !session.logoutAt && now - lastActivityTime < THREE_HOURS

      const duration = session.logoutAt
        ? new Date(session.logoutAt).getTime() - loginTime
        : now - loginTime

      const hours = Math.floor(duration / (60 * 60 * 1000))
      const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000))
      const seconds = Math.floor((duration % (60 * 1000)) / 1000)

      return {
        ...session,
        email: emailLookup.get(session.username) ?? null,
        isActive,
        sessionDuration: `${hours}h ${minutes}m ${seconds}s`,
      }
    })
  } catch {
    return []
  }
}

export async function getAccessStatistics(days: number = 7): Promise<{
  totalLogins: number
  totalAccess: number
  activeUsers: number
  accessByPage: Record<string, number>
  accessByUser: Record<string, number>
  topPages: Array<{ page: string; count: number }>
  topUsers: Array<{ username: string; email: string | null; count: number }>
}> {
  try {
    let logs = [...memoryCache.logs]

    try {
      const storedLogs = await loadLogsFromStore()
      logs = dedupeLogs([...storedLogs, ...memoryCache.logs])
    } catch {
      // Usar apenas cache se falhar
    }

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).getTime()
    const recentLogs = logs.filter((log) => new Date(log.timestamp).getTime() > cutoffDate)

    const accessByPage: Record<string, number> = {}
    const accessByUser: Record<string, number> = {}
    let totalLogins = 0

    recentLogs.forEach((log) => {
      if (log.activityType === 'login') totalLogins++

      accessByPage[log.path] = (accessByPage[log.path] || 0) + 1
      accessByUser[log.username] = (accessByUser[log.username] || 0) + 1
    })

    const topPages = Object.entries(accessByPage)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const emailLookup = await buildEmailLookup()

    const topUsers = Object.entries(accessByUser)
      .map(([username, count]) => ({
        username,
        email: emailLookup.get(username) ?? null,
        count,
      }))
      .sort((a, b) => b.count - a.count)

    return {
      totalLogins,
      totalAccess: recentLogs.length,
      activeUsers: Object.keys(accessByUser).length,
      accessByPage,
      accessByUser,
      topPages,
      topUsers,
    }
  } catch {
    return {
      totalLogins: 0,
      totalAccess: 0,
      activeUsers: 0,
      accessByPage: {},
      accessByUser: {},
      topPages: [],
      topUsers: [],
    }
  }
}
