import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, getSessionSecret, SESSION_COOKIE } from '@/lib/session'
import { verifyUserCredentials } from '@/lib/user-store'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const username = String(body?.username ?? '')
  const password = String(body?.password ?? '')

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuario e senha sao obrigatorios' }, { status: 400 })
  }

  let user
  try {
    user = await verifyUserCredentials(username, password)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[LOGIN] Erro ao verificar credenciais:', message)
    return NextResponse.json(
      { error: 'Erro ao processar autenticacao: ' + message },
      { status: 503 }
    )
  }

  if (!user) {
    return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
  }

  const secret = getSessionSecret()
  if (!secret) {
    return NextResponse.json(
      { error: 'Autenticacao nao configurada. Defina ADMIN_PASSWORD ou SESSION_SECRET.' },
      { status: 503 }
    )
  }

  let token
  try {
    token = await createSessionToken(user.username, user.role, secret)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[LOGIN] Erro ao criar token:', message)
    return NextResponse.json(
      { error: 'Erro ao criar sessao: ' + message },
      { status: 503 }
    )
  }

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
