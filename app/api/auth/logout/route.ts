import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, readSessionFromRequest } from '@/lib/session'
import { recordUserSession } from '@/lib/activity-logger'

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  // Logar o logout se houver sessão (não bloquear se falhar)
  if (session) {
    try {
      await recordUserSession(session.username, session.role, 'logout').catch((err) =>
        console.error('[LOGOUT] Erro ao logar:', err)
      )
    } catch (err) {
      console.error('[LOGOUT] Erro não esperado ao logar:', err)
    }
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })

  return response
}
