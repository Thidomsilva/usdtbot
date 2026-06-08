import { NextRequest, NextResponse } from 'next/server'
import { getPaymentById, parseExternalReference } from '@/lib/mercadopago'
import { activateUserPlan } from '@/lib/user-store'

export const runtime = 'nodejs'

/**
 * Webhook do Mercado Pago.
 * O MP envia notificações via POST com corpo JSON quando um pagamento muda de status.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    // MP pode enviar body vazio em alguns eventos, aceitar silenciosamente
    return NextResponse.json({ ok: true })
  }

  const type = String(body.type ?? body.topic ?? '')
  const dataId = body.data ? String((body.data as Record<string, unknown>).id ?? '') : String(body.id ?? '')

  console.log(`[WEBHOOK_MP] Recebido: type=${type}, id=${dataId}`)

  // Só processa notificações de pagamento
  if (type !== 'payment') {
    return NextResponse.json({ ok: true })
  }

  if (!dataId) {
    return NextResponse.json({ error: 'ID do pagamento ausente' }, { status: 400 })
  }

  try {
    const payment = await getPaymentById(dataId)

    console.log(`[WEBHOOK_MP] Pagamento ${payment.id}: status=${payment.status}, ref=${payment.external_reference}`)

    // Só ativa plano para pagamentos aprovados
    if (payment.status !== 'approved') {
      return NextResponse.json({ ok: true, status: payment.status })
    }

    if (!payment.external_reference) {
      console.error('[WEBHOOK_MP] Pagamento aprovado sem external_reference:', payment.id)
      return NextResponse.json({ error: 'external_reference ausente' }, { status: 400 })
    }

    const parsed = parseExternalReference(payment.external_reference)
    if (!parsed) {
      console.error('[WEBHOOK_MP] external_reference inválido:', payment.external_reference)
      return NextResponse.json({ error: 'external_reference inválido' }, { status: 400 })
    }

    await activateUserPlan(parsed.username, parsed.planKey, String(payment.id))

    console.log(`[WEBHOOK_MP] Plano "${parsed.planKey}" ativado para usuário: ${parsed.username}`)

    return NextResponse.json({ ok: true, activated: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[WEBHOOK_MP] Erro ao processar pagamento:', message)
    // Retorna 200 para evitar reenvios desnecessários do MP
    return NextResponse.json({ ok: false, error: message })
  }
}

// O MP também faz GET no webhook para verificação — responder 200
export async function GET() {
  return NextResponse.json({ ok: true })
}
