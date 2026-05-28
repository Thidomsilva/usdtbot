import { NextRequest, NextResponse } from 'next/server'
import { getSessionSecret, readSessionFromToken, SESSION_COOKIE } from './lib/session'

const PUBLIC_FILE_PATTERN = /\.[^/]+$/

function hasValidCronAuthorization(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function isPublicPath(pathname: string): boolean {
  return pathname === '/login'
    || pathname.startsWith('/arbitragem-scanner')
    || pathname.startsWith('/admin/arbitragem-geral')
    || pathname === '/api/auth/login'
    || pathname === '/api/prices'
    || pathname === '/api/fan-tokens'
    || pathname === '/api/p2p-arbitrage'
    || pathname === '/api/spot-futures-arbitrage'
    || pathname.startsWith('/api/telegram')
    || pathname === '/api/health/debug'
    || PUBLIC_FILE_PATTERN.test(pathname)
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith('/admin/') && pathname !== '/admin/arbitragem-geral'
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname.startsWith('/api/') && hasValidCronAuthorization(request)) {
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const secret = getSessionSecret()
  if (!secret) {
    console.error('[AUTH] SESSION_SECRET nao configurado')
    return new NextResponse('Autenticacao nao configurada. Defina ADMIN_PASSWORD ou SESSION_SECRET.', {
      status: 503,
    })
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value
  
  if (!sessionToken) {
    // Sem sessão, redireciona para login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  const session = await readSessionFromToken(sessionToken, secret).catch((error) => {
    console.error('[AUTH] Erro ao validar token:', error instanceof Error ? error.message : error)
    return null
  })

  if (!session) {
    // Token expirado (por inatividade de 3h) ou inválido
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sessao expirada ou invalida' }, { status: 401 })
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  // Verificar se é uma rota de admin
  if (isAdminPath(pathname) && session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado. Apenas admins podem acessar esta página.' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml).*)',
  ],
}
