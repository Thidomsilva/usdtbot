import { promises as fs } from 'fs'
import path from 'path'
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

// Verificar se estamos em um ambiente onde fs está disponível (Node.js)
const canUseFsModule = (): boolean => {
  try {
    return typeof process !== 'undefined' && process.env.NODE_ENV !== undefined
  } catch {
    return false
  }
}

const LOGS_FILE = path.join(process.cwd(), 'data', 'activity-logs.json')
const SESSIONS_FILE = path.join(process.cwd(), 'data', 'user-sessions.json')

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

    // Se fs disponível, também salvar em arquivo
    if (canUseFsModule()) {
      try {
        await ensureLogsFile()
        const data = await fs.readFile(LOGS_FILE, 'utf-8')
        const logsData = JSON.parse(data) as { logs: ActivityLog[] }
        logsData.logs.push(activity)
        if (logsData.logs.length > 10000) {
          logsData.logs = logsData.logs.slice(-10000)
        }
        await fs.writeFile(LOGS_FILE, JSON.stringify(logsData, null, 2))
      } catch (error) {
        console.error('[ACTIVITY LOG] Erro ao salvar em arquivo:', error)
      }
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
      const existingSession = memoryCache.sessions.find((s) => s.username === username && !s.logoutAt)
      if (existingSession) {
        existingSession.logoutAt = now
      }
      memoryCache.sessions.push({
        username,
        email: email ?? null,
        role: userRole,
        loginAt: now,
        lastActivityAt: now,
      })
    } else if (action === 'logout') {
      const session = memoryCache.sessions.find((s) => s.username === username && !s.logoutAt)
      if (session) {
        session.logoutAt = now
      }
    } else if (action === 'activity') {
      const session = memoryCache.sessions.find((s) => s.username === username && !s.logoutAt)
      if (session) {
        session.lastActivityAt = now
      }
    }

    if (memoryCache.sessions.length > 1000) {
      memoryCache.sessions = memoryCache.sessions.slice(-1000)
    }

    // Se fs disponível, também salvar em arquivo
    if (canUseFsModule()) {
      try {
        await ensureSessionsFile()
        const data = await fs.readFile(SESSIONS_FILE, 'utf-8')
        const sessionsData = JSON.parse(data) as {
          sessions: Array<{
            username: string
            email?: string | null
            role: 'admin' | 'user'
            loginAt: string
            lastActivityAt: string
            logoutAt?: string
          }>
        }

        if (action === 'login') {
          const existingSession = sessionsData.sessions.find((s) => s.username === username && !s.logoutAt)
          if (existingSession) {
            existingSession.logoutAt = now
          }
          sessionsData.sessions.push({
            username,
            email: email ?? null,
            role: userRole,
            loginAt: now,
            lastActivityAt: now,
          })
        } else if (action === 'logout') {
          const session = sessionsData.sessions.find((s) => s.username === username && !s.logoutAt)
          if (session) {
            session.logoutAt = now
          }
        } else if (action === 'activity') {
          const session = sessionsData.sessions.find((s) => s.username === username && !s.logoutAt)
          if (session) {
            session.lastActivityAt = now
          }
        }

        if (sessionsData.sessions.length > 1000) {
          sessionsData.sessions = sessionsData.sessions.slice(-1000)
        }

        await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessionsData, null, 2))
      } catch (error) {
        console.error('[SESSION LOG] Erro ao salvar em arquivo:', error)
      }
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

    // Se fs disponível, tentar carregar do arquivo também
    if (canUseFsModule()) {
      try {
        await ensureLogsFile()
        const data = await fs.readFile(LOGS_FILE, 'utf-8')
        const logsData = JSON.parse(data) as { logs: ActivityLog[] }
        const merged = [...logsData.logs, ...memoryCache.logs]
        const seen = new Set<string>()
        logs = merged.filter((log) => {
          if (seen.has(log.id)) return false
          seen.add(log.id)
          return true
        })
      } catch {
        // Usar apenas cache se falhar
      }
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
  Array<{
    username: string
    email: string | null
    role: 'admin' | 'user'
    loginAt: string
    lastActivityAt: string
    logoutAt?: string
    isActive: boolean
    sessionDuration: string
  }>
> {
  try {
    let sessions = [...memoryCache.sessions]

    // Se fs disponível, tentar carregar do arquivo também
    if (canUseFsModule()) {
      try {
        await ensureSessionsFile()
        const data = await fs.readFile(SESSIONS_FILE, 'utf-8')
        const sessionsData = JSON.parse(data) as {
          sessions: Array<{
            username: string
            email?: string | null
            role: 'admin' | 'user'
            loginAt: string
            lastActivityAt: string
            logoutAt?: string
          }>
        }
        // Mesclar e remover duplicatas (preferir dados mais recentes)
        const sessionMap = new Map<string, typeof sessions[0]>()
        sessionsData.sessions.forEach((s) => sessionMap.set(s.username, s))
        memoryCache.sessions.forEach((s) => sessionMap.set(s.username, s))
        sessions = Array.from(sessionMap.values())
      } catch {
        // Usar apenas cache se falhar
      }
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

    // Se fs disponível, tentar carregar do arquivo também
    if (canUseFsModule()) {
      try {
        await ensureLogsFile()
        const data = await fs.readFile(LOGS_FILE, 'utf-8')
        const logsData = JSON.parse(data) as { logs: ActivityLog[] }
        const merged = [...logsData.logs, ...memoryCache.logs]
        const seen = new Set<string>()
        logs = merged.filter((log) => {
          if (seen.has(log.id)) return false
          seen.add(log.id)
          return true
        })
      } catch {
        // Usar apenas cache se falhar
      }
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
