import { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret, readSessionFromToken, SESSION_COOKIE } from './lib/session'

const PUBLIC_FILE_PATTERN = /\.[^/]+$/

function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/api/auth/login' || PUBLIC_FILE_PATTERN.test(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const secret = getSessionSecret()
  if (!secret) {
    return new NextResponse('Autenticacao nao configurada. Defina ADMIN_PASSWORD ou SESSION_SECRET.', {
      status: 503,
    })
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value
  const session = sessionToken ? await readSessionFromToken(sessionToken, secret) : null

  if (session) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml).*)',
  ],
}
