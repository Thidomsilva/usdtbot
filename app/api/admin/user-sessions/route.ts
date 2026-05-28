import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminSession } from '@/lib/admin-auth'
import { getUserSessions } from '@/lib/activity-logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const admin = await ensureAdminSession(request)

  if (!admin) {
    return NextResponse.json({ error: 'Acesso negado. Apenas admin pode acessar.' }, { status: 403 })
  }

  try {
    const sessions = await getUserSessions()
    return NextResponse.json({ sessions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[API] Erro ao buscar sessões:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
