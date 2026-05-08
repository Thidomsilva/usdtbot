import { NextRequest, NextResponse } from 'next/server'

/**
 * ROTA DE DEBUG - Diagnostica problemas de autenticação
 * Acesse: /api/health/debug
 * 
 * ⚠️ REMOVER ANTES DE PRODUÇÃO
 */
export async function GET(request: NextRequest) {
  // Apenas localhost ou desenvolvimento
  const isLocal =
    request.headers.get('host')?.includes('localhost') ||
    request.headers.get('host')?.includes('127.0.0.1') ||
    process.env.NODE_ENV !== 'production'

  if (!isLocal && process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const debug: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL ? 'true' : 'false',
      VERCEL_ENV: process.env.VERCEL_ENV || 'local',
    },
    backend_config: {
      has_KV_REST_API_URL: !!process.env.KV_REST_API_URL,
      has_KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
      has_KV_REST_API_REDIS_URL: !!process.env.KV_REST_API_REDIS_URL,
      has_REDIS_URL: !!process.env.REDIS_URL,
      has_KV_URL: !!process.env.KV_URL,
      has_SESSION_SECRET: !!process.env.SESSION_SECRET,
      has_ADMIN_EMAIL: !!process.env.ADMIN_EMAIL,
      has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    },
    auth_config: {
      ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'thiago@sagacy.com.br',
      SESSION_SECRET: process.env.SESSION_SECRET ? '[SET]' : '[NOT SET]',
      using_bootstrap: !process.env.SESSION_SECRET ? 'true' : 'false',
    },
    storage_detection: {
      will_use_kv_rest: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      will_use_redis_url: !!(
        !!(process.env.KV_REST_API_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL) &&
        !(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
      ),
      will_use_file: !(
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
        process.env.KV_REST_API_REDIS_URL ||
        process.env.REDIS_URL ||
        process.env.KV_URL
      ),
      file_path_if_used: process.env.VERCEL ? '/tmp/usdtbot/users.json' : 'data/users.json',
    },
  }

  // Tentar verificar storage
  try {
    const { listUsers } = await import('@/lib/user-store')
    const users = await listUsers()
    debug.users = {
      count: users.length,
      usernames: users.map((u) => u.username),
      all_inactive: users.every((u) => !u.active),
      status: 'OK',
    }
  } catch (error) {
    debug.users = {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'FAILED',
    }
  }

  // Verificar conexão Redis se estiver usando
  if (debug.storage_detection.will_use_redis_url) {
    try {
      const { createClient } = await import('redis')
      const url = process.env.KV_REST_API_REDIS_URL || process.env.REDIS_URL || process.env.KV_URL
      const client = createClient({ url })
      const connectPromise = client.connect()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      )
      await Promise.race([connectPromise, timeoutPromise])
      debug.redis_status = { connected: true, url_configured: !!url }
      await client.quit()
    } catch (error) {
      debug.redis_status = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  return NextResponse.json(debug, { status: 200 })
}
