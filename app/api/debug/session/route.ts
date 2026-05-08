import { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret, readSessionFromToken, SESSION_COOKIE } from '@/lib/session'

export async function GET(request: NextRequest) {
  const secret = getSessionSecret()
  if (!secret) {
    return NextResponse.json({ error: 'SESSION_SECRET not configured' }, { status: 503 })
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value

  if (!sessionToken) {
    return NextResponse.json({ has_token: false, error: 'No session cookie' }, { status: 401 })
  }

  const session = await readSessionFromToken(sessionToken, secret).catch((error) => {
    return null
  })

  if (!session) {
    return NextResponse.json({ has_token: true, session_valid: false, error: 'Invalid token' }, { status: 401 })
  }

  return NextResponse.json({
    has_token: true,
    session_valid: true,
    username: session.username,
    role: session.role,
    exp: session.exp,
    exp_date: new Date(session.exp * 1000).toISOString(),
    now: new Date().toISOString(),
  })
}
