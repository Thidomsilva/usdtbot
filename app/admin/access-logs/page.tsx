'use client'

import { useEffect, useState } from 'react'
import styles from '@/app/ModernGrid.module.css'

interface ActivityLog {
  id: string
  username: string
  userRole: 'admin' | 'user'
  activityType: 'login' | 'logout' | 'page_access' | 'api_call'
  path: string
  method?: string
  timestamp: string
}

interface UserSession {
  username: string
  role: 'admin' | 'user'
  loginAt: string
  lastActivityAt: string
  logoutAt?: string
  isActive: boolean
  sessionDuration: string
}

interface Statistics {
  totalLogins: number
  totalAccess: number
  activeUsers: number
  accessByPage: Record<string, number>
  accessByUser: Record<string, number>
  topPages: Array<{ page: string; count: number }>
  topUsers: Array<{ username: string; count: number }>
}

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [days, setDays] = useState(7)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [logsRes, sessionsRes, statsRes] = await Promise.all([
          fetch('/api/admin/access-logs?limit=500' + (filter ? `&username=${filter}` : '')),
          fetch('/api/admin/user-sessions'),
          fetch(`/api/admin/statistics?days=${days}`),
        ])

        if (logsRes.ok) {
          const data = await logsRes.json()
          setLogs(data.logs || [])
        }
        if (sessionsRes.ok) {
          const data = await sessionsRes.json()
          setSessions(data.sessions || [])
        }
        if (statsRes.ok) {
          const data = await statsRes.json()
          setStats(data.stats || null)
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(fetchData, 500)
    return () => clearTimeout(timer)
  }, [filter, days])

  const activeUsers = sessions.filter((s) => s.isActive)
  const activeCount = activeUsers.length

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('pt-BR')
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'login':
        return '#22c55e'
      case 'logout':
        return '#ef4444'
      case 'page_access':
        return '#3b82f6'
      case 'api_call':
        return '#a78bfa'
      default:
        return '#6b7280'
    }
  }

  return (
    <div className={styles.container}>
      <h1>📊 Dashboard de Acessos</h1>

      {/* Estatísticas Gerais */}
      <div className={styles.grid}>
        <div className={styles.card} style={{ borderLeft: '4px solid #22c55e' }}>
          <h3>Usuários Online</h3>
          <p style={{ fontSize: '2em', fontWeight: 'bold', color: '#22c55e' }}>{activeCount}</p>
          <p style={{ fontSize: '0.9em', color: '#6b7280' }}>de {sessions.length} total</p>
        </div>

        <div className={styles.card} style={{ borderLeft: '4px solid #3b82f6' }}>
          <h3>Logins (últimos {days}d)</h3>
          <p style={{ fontSize: '2em', fontWeight: 'bold', color: '#3b82f6' }}>{stats?.totalLogins || 0}</p>
        </div>

        <div className={styles.card} style={{ borderLeft: '4px solid #8b5cf6' }}>
          <h3>Total de Acessos</h3>
          <p style={{ fontSize: '2em', fontWeight: 'bold', color: '#8b5cf6' }}>{stats?.totalAccess || 0}</p>
        </div>

        <div className={styles.card} style={{ borderLeft: '4px solid #f59e0b' }}>
          <h3>Usuários Ativos</h3>
          <p style={{ fontSize: '2em', fontWeight: 'bold', color: '#f59e0b' }}>{stats?.activeUsers || 0}</p>
        </div>
      </div>

      {/* Top Páginas e Usuários */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div className={styles.card}>
          <h2>Top Páginas Acessadas</h2>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {stats?.topPages.map((page, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.9em', color: '#4b5563' }}>{page.page}</span>
                <span
                  style={{
                    backgroundColor: '#e0e7ff',
                    color: '#3730a3',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                  }}
                >
                  {page.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <h2>Top Usuários</h2>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {stats?.topUsers.map((user, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.9em', color: '#4b5563' }}>{user.username}</span>
                <span
                  style={{
                    backgroundColor: '#fef08a',
                    color: '#713f12',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                  }}
                >
                  {user.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usuários Online */}
      <div className={styles.card} style={{ marginBottom: '30px' }}>
        <h2>Usuários Online Agora</h2>
        {activeUsers.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Nenhum usuário online</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Usuário</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Perfil</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Login em</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Último Acesso</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Duração</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((session) => (
                  <tr key={session.username} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>
                      <strong>{session.username}</strong>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          backgroundColor: session.role === 'admin' ? '#fee2e2' : '#e0f2fe',
                          color: session.role === 'admin' ? '#991b1b' : '#0c2d6b',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.85em',
                          fontWeight: 'bold',
                        }}
                      >
                        {session.role === 'admin' ? '👤 Admin' : '👤 User'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.9em', color: '#6b7280' }}>
                      {formatDate(session.loginAt)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.9em', color: '#6b7280' }}>
                      {formatDate(session.lastActivityAt)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.9em', color: '#6b7280' }}>
                      {session.sessionDuration}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico de Acessos */}
      <div className={styles.card}>
        <h2>Histórico de Acessos</h2>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Filtrar por usuário..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              flex: 1,
            }}
          />
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
            }}
          >
            <option value={1}>Últimas 24h</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: '#6b7280' }}>Carregando...</p>
        ) : logs.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Nenhum acesso encontrado</p>
        ) : (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Usuário</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Caminho</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Horário</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>
                      <strong>{log.username}</strong>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          backgroundColor: getActivityColor(log.activityType),
                          color: 'white',
                          padding: '3px 8px',
                          borderRadius: '3px',
                          fontSize: '0.85em',
                          fontWeight: 'bold',
                        }}
                      >
                        {log.activityType === 'login'
                          ? '🔓 Login'
                          : log.activityType === 'logout'
                            ? '🔒 Logout'
                            : log.activityType === 'page_access'
                              ? '📄 Página'
                              : '🔗 API'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.9em', color: '#4b5563' }}>{log.path}</td>
                    <td style={{ padding: '10px', fontSize: '0.9em', color: '#6b7280' }}>
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
