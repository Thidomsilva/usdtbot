import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE } from '@/lib/session'
import { verifyUserCredentials } from '@/lib/user-store'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const username = String(body?.username ?? '')
  const password = String(body?.password ?? '')

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuario e senha sao obrigatorios' }, { status: 400 })
  }

  const user = await verifyUserCredentials(username, password)
  if (!user) {
    return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
  }

  const secret = process.env.SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SESSION_SECRET nao configurado' }, { status: 503 })
  }

  const token = await createSessionToken(user.username, user.role, secret)
  const response = NextResponse.json({ ok: true, user: { username: user.username, role: user.role } })

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })

  return response
}
