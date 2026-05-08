import { NextRequest, NextResponse } from 'next/server'
import { exportUsersBackup, restoreUsersBackup } from '@/lib/user-store'
import { readSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

async function requireAdmin(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  if (!session) {
    return { error: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) }
  }

  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }

  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  try {
    const backup = await exportUsersBackup()
    return NextResponse.json(backup)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao exportar backup'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  const body = await request.json().catch(() => null)

  try {
    const restoredCount = await restoreUsersBackup(body)
    return NextResponse.json({ ok: true, restoredCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao restaurar backup'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
