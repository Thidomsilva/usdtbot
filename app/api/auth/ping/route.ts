import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromRequest } from '@/lib/session'
import { recordUserSession } from '@/lib/activity-logger'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  if (!session) {
    return NextResponse.json({ error: 'Sessao invalida' }, { status: 401 })
  }

  try {
    await recordUserSession(session.username, session.role, 'activity', session.email ?? null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[PING] Erro ao registrar atividade:', message)
  }

  return NextResponse.json({ ok: true })
}
