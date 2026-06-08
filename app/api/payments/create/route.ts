import { NextRequest, NextResponse } from 'next/server'
import { createPaymentPreference, buildExternalReference, PLANOS, PlanKey } from '@/lib/mercadopago'
import { createPendingUser } from '@/lib/user-store'
import { readSessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const planKey = String(body.planKey ?? '')
  if (planKey !== 'weekly' && planKey !== 'monthly') {
    return NextResponse.json({ error: 'Plano inválido. Use "weekly" ou "monthly".' }, { status: 400 })
  }

  // Determina quem é o usuário
  let username: string
  let payerEmail: string

  // Tenta identificar sessão existente
  const session = await readSessionFromRequest(request).catch(() => null)

  if (session) {
    // Usuário já logado — renovação de plano
    username = session.username
    payerEmail = session.email ?? session.username
  } else {
    // Novo usuário — exige email + password
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '').trim()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios para novos usuários.' },
        { status: 400 }
      )
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 6 caracteres.' }, { status: 400 })
    }

    // Cria conta pendente (inativa até confirmar pagamento)
    try {
      await createPendingUser({ email, password })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    username = email
    payerEmail = email
  }

  // Cria preferência no Mercado Pago
  try {
    const externalReference = buildExternalReference(username, planKey as PlanKey)
    const preference = await createPaymentPreference({
      planKey: planKey as PlanKey,
      payerEmail,
      externalReference,
    })

    return NextResponse.json({
      ok: true,
      checkoutUrl: preference.init_point,
      planLabel: PLANOS[planKey as PlanKey].label,
      planPrice: PLANOS[planKey as PlanKey].price,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao criar pagamento'
    console.error('[PAYMENTS] Erro ao criar preferência MP:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
