import { NextRequest } from 'next/server'

export type SessionRole = 'admin' | 'user'

type SessionPayload = {
  username: string
  role: SessionRole
  exp: number
}

export const SESSION_COOKIE = 'usdtbot_session'

export function getSessionSecret(): string | null {
  const explicitSecret = process.env.SESSION_SECRET?.trim()
  if (explicitSecret) {
    return explicitSecret
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? 'thiago@sagacy.com.br').trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD?.trim()

  if (!adminPassword) {
    return null
  }

  return `bootstrap:${adminEmail}:${adminPassword}`
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(base64url: string): string {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4 || 4)) % 4)}`
  return padded.replace(/-/g, '+').replace(/_/g, '/')
}

function base64EncodeUtf8(value: string): string {
  // Tenta usar Buffer do Node.js primeiro (mais confiável)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64')
  }

  // Fallback para navegador
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }

  throw new Error('btoa nao disponivel e Buffer nao encontrado')
}

function base64DecodeUtf8(value: string): string {
  // Tenta usar Buffer do Node.js primeiro
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf-8')
  }

  // Fallback para navegador
  if (typeof atob === 'function') {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  throw new Error('atob nao disponivel e Buffer nao encontrado')
}

function base64UrlEncode(value: string): string {
  return toBase64Url(base64EncodeUtf8(value))
}

function base64UrlDecode(value: string): string {
  return base64DecodeUtf8(fromBase64Url(value))
}

async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  )

  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return toBase64Url(btoa(binary))
}

export async function createSessionToken(
  username: string,
  role: SessionRole,
  secret: string,
  durationSeconds = 60 * 60 * 3 // 3 horas de inatividade
): Promise<string> {
  const payload: SessionPayload = {
    username,
    role,
    exp: Math.floor(Date.now() / 1000) + durationSeconds,
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export async function readSessionFromToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) {
    return null
  }

  const [encodedPayload, signature] = parts
  const expected = await sign(encodedPayload, secret)

  if (signature !== expected) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload
    const now = Math.floor(Date.now() / 1000)

    if (!payload.username || !payload.role || typeof payload.exp !== 'number') {
      return null
    }

    if (payload.exp <= now) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export async function readSessionFromRequest(request: NextRequest) {
  const secret = getSessionSecret()
  if (!secret) {
    return null
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return null
  }

  return readSessionFromToken(token, secret)
}
