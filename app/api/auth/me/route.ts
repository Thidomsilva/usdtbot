import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromRequest } from '@/lib/session'

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      username: session.username,
      email: session.email ?? null,
      role: session.role,
    },
  })
}
