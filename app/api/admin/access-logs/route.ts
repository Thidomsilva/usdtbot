import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminSession } from '@/lib/admin-auth'
import { getActivityLogs } from '@/lib/activity-logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const admin = await ensureAdminSession(request)

  if (!admin) {
    return NextResponse.json({ error: 'Acesso negado. Apenas admin pode acessar.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '500', 10)
  const username = url.searchParams.get('username') ?? undefined

  try {
    const logs = await getActivityLogs(limit, username)
    return NextResponse.json({ logs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[API] Erro ao buscar logs:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
