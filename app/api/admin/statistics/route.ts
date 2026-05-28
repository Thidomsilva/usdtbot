import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminSession } from '@/lib/admin-auth'
import { getAccessStatistics } from '@/lib/activity-logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const admin = await ensureAdminSession(request)

  if (!admin) {
    return NextResponse.json({ error: 'Acesso negado. Apenas admin pode acessar.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const days = parseInt(url.searchParams.get('days') ?? '7', 10)

  try {
    const stats = await getAccessStatistics(days)
    return NextResponse.json({ stats })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[API] Erro ao buscar estatísticas:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
