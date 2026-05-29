'use client'

import { useEffect, useState } from 'react'

interface ActivityLog {
  id: string
  username: string
  userRole: 'admin' | 'user'
  activityType: 'login' | 'logout' | 'page_access' | 'api_call'
  path: string
  method?: string
  timestamp: string
  lastActivityAt?: string
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

interface AdminUser {
  username: string
  email: string | null
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
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [days, setDays] = useState(7)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [logsRes, sessionsRes, statsRes, usersRes] = await Promise.all([
          fetch('/api/admin/access-logs?limit=500' + (filter ? `&username=${filter}` : '')),
          fetch('/api/admin/user-sessions'),
          fetch(`/api/admin/statistics?days=${days}`),
          fetch('/api/admin/users'),
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
        if (usersRes.ok) {
          const data = await usersRes.json()
          setUsers(data.users || [])
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

  const getEmailForUsername = (username: string) => {
    const user = users.find((entry) => entry.username === username)
    return user?.email ?? null
  }

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    content: {
      maxWidth: '1400px',
      margin: '0 auto',
    },
    header: {
      marginBottom: '40px',
      textAlign: 'center' as const,
    },
    title: {
      fontSize: '36px',
      fontWeight: 'bold',
      color: '#ffffff',
      margin: '0 0 10px 0',
    },
    subtitle: {
      fontSize: '14px',
      color: '#a0aec0',
      margin: 0,
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '40px',
    },
    statCard: {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '16px',
      padding: '24px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
    },
    statValue: {
      fontSize: '48px',
      fontWeight: 'bold',
      margin: '12px 0 8px 0',
      backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundClip: 'text' as const,
      WebkitBackgroundClip: 'text' as const,
      WebkitTextFillColor: 'transparent' as const,
    },
    statLabel: {
      fontSize: '16px',
      color: '#ffffff',
      fontWeight: '600',
      margin: '0 0 12px 0',
    },
    statSubtext: {
      fontSize: '13px',
      color: '#a0aec0',
      margin: 0,
    },
    sectionCard: {
      background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '16px',
      padding: '28px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      marginBottom: '24px',
    },
    sectionTitle: {
      fontSize: '22px',
      fontWeight: '700',
      color: '#ffffff',
      margin: '0 0 20px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    topGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '24px',
      marginBottom: '24px',
    },
    topItem: {
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: '#a0aec0',
      fontSize: '14px',
    },
    topItemName: {
      color: '#ffffff',
      fontWeight: '500',
      flex: 1,
      wordBreak: 'break-word' as const,
    },
    topItemMeta: {
      color: '#94a3b8',
      fontSize: '12px',
      marginTop: '4px',
      wordBreak: 'break-word' as const,
    },
    topItemCount: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '4px 12px',
      borderRadius: '8px',
      fontWeight: 'bold',
      fontSize: '12px',
      marginLeft: '12px',
    },
    filterSection: {
      display: 'flex',
      gap: '12px',
      marginBottom: '20px',
      flexWrap: 'wrap' as const,
    },
    input: {
      padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      background: 'rgba(255,255,255,0.05)',
      color: '#ffffff',
      fontSize: '14px',
      flex: 1,
      minWidth: '200px',
      backdropFilter: 'blur(10px)',
    },
    select: {
      padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '8px',
      background: 'rgba(255,255,255,0.05)',
      color: '#ffffff',
      fontSize: '14px',
      backdropFilter: 'blur(10px)',
      cursor: 'pointer',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse' as const,
      fontSize: '14px',
    },
    tableHeader: {
      borderBottom: '2px solid rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    tableHeaderCell: {
      textAlign: 'left' as const,
      padding: '12px 16px',
      fontWeight: '600',
      color: '#ffffff',
      fontSize: '13px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    },
    tableRow: {
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      transition: 'background-color 0.2s ease',
    },
    tableCell: {
      padding: '14px 16px',
      color: '#a0aec0',
      fontSize: '13px',
    },
    usernameBold: {
      fontWeight: '600',
      color: '#ffffff',
    },
    badge: {
      display: 'inline-block',
      padding: '4px 10px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      whiteSpace: 'nowrap' as const,
    },
    onlineUsers: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '16px',
    },
    userCard: {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      color: '#ffffff',
      fontWeight: '600',
      fontSize: '14px',
      margin: '0 0 4px 0',
    },
    userEmail: {
      fontSize: '12px',
      color: '#94a3b8',
      margin: '0 0 6px 0',
      wordBreak: 'break-word' as const,
    },
    userMeta: {
      fontSize: '12px',
      color: '#a0aec0',
      margin: '4px 0 0 0',
    },
    emptyState: {
      textAlign: 'center' as const,
      padding: '40px 20px',
      color: '#a0aec0',
    },
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.header}>
          <h1 style={styles.title}>📊 Dashboard de Acessos</h1>
          <p style={styles.subtitle}>Monitoramento em tempo real de acesso ao sistema</p>
        </div>

        {/* Estatísticas */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>👥 Online Agora</div>
            <div style={styles.statValue}>{activeCount}</div>
            <div style={styles.statSubtext}>de {sessions.length} total registrado</div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>🔓 Logins</div>
            <div style={styles.statValue}>{stats?.totalLogins || 0}</div>
            <div style={styles.statSubtext}>últimos {days} dias</div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>📈 Total de Acessos</div>
            <div style={styles.statValue}>{stats?.totalAccess || 0}</div>
            <div style={styles.statSubtext}>interações registradas</div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>⭐ Usuários Ativos</div>
            <div style={styles.statValue}>{stats?.activeUsers || 0}</div>
            <div style={styles.statSubtext}>diferentes usuários</div>
          </div>
        </div>

        {/* Top Páginas e Usuários */}
        <div style={styles.topGrid}>
          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>🔥 Top Páginas Acessadas</div>
            {stats?.topPages && stats.topPages.length > 0 ? (
              <div>
                {stats.topPages.map((page, idx) => (
                  <div key={idx} style={styles.topItem}>
                    <span style={styles.topItemName} title={page.page}>{page.page}</span>
                    <span style={styles.topItemCount}>{page.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>Nenhum acesso registrado</div>
            )}
          </div>

          <div style={styles.sectionCard}>
            <div style={styles.sectionTitle}>👤 Top Usuários</div>
            {stats?.topUsers && stats.topUsers.length > 0 ? (
              <div>
                {stats.topUsers.map((user, idx) => (
                  <div key={idx} style={styles.topItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.topItemName}>{user.username}</div>
                      <div style={styles.topItemMeta}>
                        E-mail: {getEmailForUsername(user.username) || 'não cadastrado'}
                      </div>
                    </div>
                    <span style={styles.topItemCount}>{user.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>Nenhum usuário</div>
            )}
          </div>
        </div>

        {/* Usuários Online */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionTitle}>✅ Usuários Online Agora</div>
          {activeUsers.length === 0 ? (
            <div style={styles.emptyState}>Nenhum usuário online no momento</div>
          ) : (
            <div style={styles.onlineUsers}>
              {activeUsers.map((session) => (
                <div key={session.username} style={styles.userCard}>
                  <div style={styles.userInfo}>
                    <p style={styles.userName}>
                      {session.role === 'admin' ? '👤' : '👤'} {session.username}
                    </p>
                    <p style={styles.userEmail}>
                      E-mail: {getEmailForUsername(session.username) || 'não cadastrado'}
                    </p>
                    <p style={styles.userMeta}>
                      <span style={{ ...styles.badge, background: session.role === 'admin' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: session.role === 'admin' ? '#ef4444' : '#3b82f6' }}>
                        {session.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </p>
                    <p style={styles.userMeta}>
                      Login: {formatDate(session.loginAt)}
                    </p>
                    <p style={styles.userMeta}>
                      Online há: {session.sessionDuration}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Histórico de Acessos */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionTitle}>📋 Histórico de Acessos</div>
          <div style={styles.filterSection}>
            <input
              type="text"
              placeholder="Filtrar por usuário..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={styles.input}
            />
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              style={styles.select}
            >
              <option value={1}>Últimas 24h</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.emptyState}>Carregando dados...</div>
          ) : logs.length === 0 ? (
            <div style={styles.emptyState}>Nenhum acesso encontrado</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead style={styles.tableHeader}>
                  <tr>
                    <th style={styles.tableHeaderCell}>Usuário</th>
                    <th style={styles.tableHeaderCell}>E-mail</th>
                    <th style={styles.tableHeaderCell}>Tipo</th>
                    <th style={styles.tableHeaderCell}>Página/Rota</th>
                    <th style={styles.tableHeaderCell}>Horário</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>
                        <span style={styles.usernameBold}>{log.username}</span>
                      </td>
                      <td style={styles.tableCell}>
                        {getEmailForUsername(log.username) || 'não cadastrado'}
                      </td>
                      <td style={styles.tableCell}>
                        <span
                          style={{
                            ...styles.badge,
                            background: log.activityType === 'login' ? 'rgba(34, 197, 94, 0.2)' : 
                                      log.activityType === 'logout' ? 'rgba(239, 68, 68, 0.2)' :
                                      log.activityType === 'page_access' ? 'rgba(59, 130, 246, 0.2)' :
                                      'rgba(168, 85, 247, 0.2)',
                            color: log.activityType === 'login' ? '#22c55e' :
                                   log.activityType === 'logout' ? '#ef4444' :
                                   log.activityType === 'page_access' ? '#3b82f6' :
                                   '#a855f7',
                          }}
                        >
                          {log.activityType === 'login' ? '🔓 Login' :
                           log.activityType === 'logout' ? '🔒 Logout' :
                           log.activityType === 'page_access' ? '📄 Página' :
                           '🔗 API'}
                        </span>
                      </td>
                      <td style={styles.tableCell}>{log.path}</td>
                      <td style={styles.tableCell}>{formatDate(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
