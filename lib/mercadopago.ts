/**
 * Helpers para integração com Mercado Pago via REST API.
 * Evita dependência do SDK oficial para manter o bundle leve.
 */

export const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://usdtbot.vercel.app').replace(/\/$/, '')

export const PLANOS = {
  weekly: {
    label: 'Plano Semanal',
    description: '7 dias de acesso completo',
    price: 12.99,
    days: 7,
  },
  monthly: {
    label: 'Plano Mensal',
    description: '30 dias de acesso completo',
    price: 34.99,
    days: 30,
  },
} as const

export type PlanKey = keyof typeof PLANOS

export interface MPPreferenceResult {
  id: string
  init_point: string
  sandbox_init_point: string
}

export interface MPPaymentData {
  id: number
  status: string
  status_detail: string
  external_reference: string
  transaction_amount: number
  payment_method_id: string
  payer: {
    email: string
    first_name?: string
    last_name?: string
  }
}

function getMPAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  if (!token) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado')
  }
  return token
}

/**
 * Cria uma preferência de pagamento no Mercado Pago.
 * Retorna a URL de checkout (init_point).
 */
export async function createPaymentPreference(input: {
  planKey: PlanKey
  payerEmail: string
  externalReference: string // username do usuário
}): Promise<MPPreferenceResult> {
  const accessToken = getMPAccessToken()
  const plan = PLANOS[input.planKey]

  const body = {
    items: [
      {
        id: `usdtbot_${input.planKey}`,
        title: plan.label,
        description: plan.description,
        quantity: 1,
        unit_price: plan.price,
        currency_id: 'BRL',
      },
    ],
    payer: {
      email: input.payerEmail,
    },
    back_urls: {
      success: `${APP_BASE_URL}/pagamento/sucesso`,
      failure: `${APP_BASE_URL}/pagamento/falha`,
      pending: `${APP_BASE_URL}/pagamento/pendente`,
    },
    auto_return: 'approved',
    notification_url: `${APP_BASE_URL}/api/payments/webhook`,
    external_reference: input.externalReference,
    payment_methods: {
      // Aceitar PIX e cartão de crédito/boleto
      excluded_payment_methods: [],
      excluded_payment_types: [],
      installments: 1,
    },
    statement_descriptor: 'USDTBot Scanner',
  }

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Mercado Pago retornou ${response.status}: ${errorText}`)
  }

  const data = await response.json() as MPPreferenceResult
  return data
}

/**
 * Busca os detalhes de um pagamento pelo ID.
 */
export async function getPaymentById(paymentId: string | number): Promise<MPPaymentData> {
  const accessToken = getMPAccessToken()

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Mercado Pago retornou ${response.status}: ${errorText}`)
  }

  return response.json() as Promise<MPPaymentData>
}

/**
 * Extrai e valida o planKey do external_reference.
 * Formato do external_reference: "username|planKey"
 */
export function parseExternalReference(ref: string): { username: string; planKey: PlanKey } | null {
  const parts = ref.split('|')
  if (parts.length !== 2) return null

  const [username, planKey] = parts
  if (!username || !planKey) return null
  if (planKey !== 'weekly' && planKey !== 'monthly') return null

  return { username, planKey }
}

/**
 * Monta o external_reference codificando username e plano.
 */
export function buildExternalReference(username: string, planKey: PlanKey): string {
  return `${username}|${planKey}`
}
