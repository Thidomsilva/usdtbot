import { NextRequest, NextResponse } from 'next/server'
import { createUser, deleteUser, listUsers, setUserActive, updateUserCredentials } from '@/lib/user-store'
import { readSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

async function requireAdmin(request: NextRequest) {
  const session = await readSessionFromRequest(request)

  if (!session) {
    return { error: NextResponse.json({ error: 'Nao autenticado' }, { status: 401 }) }
  }

  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  }

  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  const users = await listUsers()
  return NextResponse.json({ users })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  const body = await request.json().catch(() => null)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '').trim()
  const role = body?.role === 'admin' ? 'admin' : 'user'

  if (!username || !password) {
    return NextResponse.json({ error: 'Usuario e senha sao obrigatorios' }, { status: 400 })
  }

  try {
    const user = await createUser({ username, password, role })
    return NextResponse.json({ ok: true, user }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar usuario'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  const body = await request.json().catch(() => null)
  const username = String(body?.username ?? '').trim()

  if (!username) {
    return NextResponse.json({ error: 'Usuario e obrigatorio' }, { status: 400 })
  }

  try {
    await deleteUser(username, auth.session.username)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao remover usuario'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return auth.error
  }

  const body = await request.json().catch(() => null)
  const username = String(body?.username ?? '').trim()
  const currentUsername = String(body?.currentUsername ?? body?.username ?? '').trim()
  const nextUsername = typeof body?.nextUsername === 'string' ? body.nextUsername : undefined
  const password = typeof body?.password === 'string' ? body.password : undefined
  const active = body?.active

  if (nextUsername !== undefined || password !== undefined) {
    if (!currentUsername) {
      return NextResponse.json({ error: 'Usuario atual e obrigatorio' }, { status: 400 })
    }

    try {
      const user = await updateUserCredentials({ currentUsername, nextUsername, password })
      return NextResponse.json({ ok: true, user })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar usuario'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  if (!username || typeof active !== 'boolean') {
    return NextResponse.json({ error: 'Usuario e status sao obrigatorios' }, { status: 400 })
  }

  try {
    const user = await setUserActive(username, active, auth.session.username)
    return NextResponse.json({ ok: true, user })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar usuario'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
