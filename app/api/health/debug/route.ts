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
      has_SUPABASE_URL: !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabase_storage_table: process.env.SUPABASE_STORAGE_TABLE || 'app_storage',
      has_KV_REST_API_URL: !!process.env.KV_REST_API_URL,
      has_KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
      has_KV_REST_API_REDIS_URL: !!process.env.KV_REST_API_REDIS_URL,
      has_REDIS_URL: !!process.env.REDIS_URL,
      has_KV_URL: !!process.env.KV_URL,
      has_UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
      has_UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      has_UPSTASH_REDIS_URL: !!process.env.UPSTASH_REDIS_URL,
      has_STORAGE_REST_URL: !!process.env.STORAGE_REST_URL,
      has_STORAGE_REST_TOKEN: !!process.env.STORAGE_REST_TOKEN,
      has_STORAGE_URL: !!process.env.STORAGE_URL,
      has_SESSION_SECRET: !!process.env.SESSION_SECRET,
      has_ADMIN_EMAIL: !!process.env.ADMIN_EMAIL,
      has_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
      has_TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      has_TELEGRAM_TOKEN: !!process.env.TELEGRAM_TOKEN,
      has_BOT_TOKEN: !!process.env.BOT_TOKEN,
      has_TELEGRAM_WEBHOOK_SECRET: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      has_TELEGRAM_SECRET: !!process.env.TELEGRAM_SECRET,
      has_WEBHOOK_SECRET: !!process.env.WEBHOOK_SECRET,
      allow_ephemeral_user_storage: process.env.ALLOW_EPHEMERAL_USER_STORAGE === 'true',
    },
    auth_config: {
      ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'thiago@sagacy.com.br',
      SESSION_SECRET: process.env.SESSION_SECRET ? '[SET]' : '[NOT SET]',
      using_bootstrap: !process.env.SESSION_SECRET ? 'true' : 'false',
    },
    storage_detection: {
      will_use_supabase: !!(
        (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      will_use_kv_rest: !!(
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
        (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
        (process.env.STORAGE_REST_URL && process.env.STORAGE_REST_TOKEN)
      ) &&
        !((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY),
      will_use_redis_url: !!(
        !!(
          process.env.KV_REST_API_REDIS_URL ||
          process.env.REDIS_URL ||
          process.env.KV_URL ||
          process.env.UPSTASH_REDIS_URL ||
          process.env.STORAGE_URL
        ) &&
        !(
          (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
          (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
          (process.env.STORAGE_REST_URL && process.env.STORAGE_REST_TOKEN) ||
          ((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY)
        )
      ),
      will_use_file: !(
        ((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
        (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
        (process.env.STORAGE_REST_URL && process.env.STORAGE_REST_TOKEN) ||
        process.env.KV_REST_API_REDIS_URL ||
        process.env.REDIS_URL ||
        process.env.KV_URL ||
        process.env.UPSTASH_REDIS_URL ||
        process.env.STORAGE_URL
      ),
      file_path_if_used: process.env.VERCEL ? '/tmp/usdtbot/users.json' : 'data/users.json',
      durable_storage_required: !!process.env.VERCEL && process.env.ALLOW_EPHEMERAL_USER_STORAGE !== 'true',
    },
  }

  debug.storage_detection.effective_storage_safe = !(
    debug.storage_detection.durable_storage_required && debug.storage_detection.will_use_file
  )

  debug.telegram_config = {
    token_env_detected: !!(
      process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN
    ),
    token_env_source: process.env.TELEGRAM_BOT_TOKEN
      ? 'TELEGRAM_BOT_TOKEN'
      : process.env.TELEGRAM_TOKEN
        ? 'TELEGRAM_TOKEN'
        : process.env.BOT_TOKEN
          ? 'BOT_TOKEN'
          : 'none',
    webhook_secret_env_detected: !!(
      process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_SECRET || process.env.WEBHOOK_SECRET
    ),
    webhook_secret_env_source: process.env.TELEGRAM_WEBHOOK_SECRET
      ? 'TELEGRAM_WEBHOOK_SECRET'
      : process.env.TELEGRAM_SECRET
        ? 'TELEGRAM_SECRET'
        : process.env.WEBHOOK_SECRET
          ? 'WEBHOOK_SECRET'
          : 'none',
  }

  if (!debug.storage_detection.effective_storage_safe) {
    debug.storage_detection.warning =
      'Deploy Vercel sem Supabase ou Redis/KV configurado. O sistema deve ser tratado como indisponivel para login/admin ate corrigir isso.'
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
      const url =
        process.env.KV_REST_API_REDIS_URL ||
        process.env.REDIS_URL ||
        process.env.KV_URL ||
        process.env.UPSTASH_REDIS_URL ||
        process.env.STORAGE_URL
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

  if (debug.storage_detection.will_use_supabase) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      const table = process.env.SUPABASE_STORAGE_TABLE || 'app_storage'
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { error } = await client.from(table).select('key').limit(1)
      if (error) {
        throw new Error(error.message)
      }

      debug.supabase_status = {
        connected: true,
        table,
      }
    } catch (error) {
      debug.supabase_status = {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  return NextResponse.json(debug, { status: 200 })
}
