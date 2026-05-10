/**
 * Módulo central de controle de planos e permissões.
 *
 * PONTO DE CONTROLE PRINCIPAL:
 * - COBRANCA_ATIVA=false → todos têm acesso completo (como Pro)
 * - COBRANCA_ATIVA=true  → limites por plano entram em vigor
 *
 * TRIAL_ATIVO=false → trial não é oferecido
 * TRIAL_ATIVO=true  → novo usuário recebe 7 dias Pro ao fazer /start
 */

export type UserPlan = "free" | "pro" | "admin";

export type PlanUserInfo = {
	plan: UserPlan;
	planActive: boolean;
	planExpiresAt: number | null; // epoch ms
	trialUsed: boolean;
};

export type Funcionalidade =
	| "trilha_a"
	| "trilha_b"
	| "trilha_c"
	| "alertas_automaticos"
	| "silencio_noturno"
	| "historico_alertas"
	| "simulacao_custom"
	| "spread_custom"
	| "admin_panel";

// Permissões por plano quando COBRANCA_ATIVA=true
const PERMISSOES: Record<"free" | "pro" | "admin", Funcionalidade[]> = {
	free: ["trilha_a", "alertas_automaticos"],
	pro: [
		"trilha_a",
		"trilha_b",
		"trilha_c",
		"alertas_automaticos",
		"silencio_noturno",
		"historico_alertas",
		"simulacao_custom",
		"spread_custom",
	],
	admin: [
		"trilha_a",
		"trilha_b",
		"trilha_c",
		"alertas_automaticos",
		"silencio_noturno",
		"historico_alertas",
		"simulacao_custom",
		"spread_custom",
		"admin_panel",
	],
};

function isCobrancaAtiva(): boolean {
	return process.env.COBRANCA_ATIVA?.trim().toLowerCase() === "true";
}

export function isTrialAtivo(): boolean {
	return process.env.TRIAL_ATIVO?.trim().toLowerCase() === "true";
}

/**
 * Verifica se um usuário tem acesso a uma funcionalidade.
 * Quando COBRANCA_ATIVA=false, todos têm acesso completo.
 */
export function temAcesso(user: PlanUserInfo, funcionalidade: Funcionalidade): boolean {
	// Se cobrança desativada → libera tudo
	if (!isCobrancaAtiva()) return true;

	// Admin sempre passa
	if (user.plan === "admin") return true;

	// Plano inativo
	if (!user.planActive) return false;

	// Plano expirado
	if (user.planExpiresAt !== null && user.planExpiresAt < Date.now()) return false;

	return PERMISSOES[user.plan].includes(funcionalidade);
}

/**
 * Retorna true se o plano estiver ativo e vigente.
 * Quando cobrança desativada, sempre retorna true.
 */
export function isPlanValid(user: PlanUserInfo): boolean {
	if (!isCobrancaAtiva()) return true;
	if (user.plan === "admin") return true;
	if (!user.planActive) return false;
	if (user.planExpiresAt !== null && user.planExpiresAt < Date.now()) return false;
	return true;
}

/** Limites de alertas automáticos por dia */
export function maxAlertasPerDay(user: PlanUserInfo): number {
	if (!isCobrancaAtiva()) return Infinity;
	if (user.plan === "admin" || user.plan === "pro") return Infinity;
	return 3;
}

/** Spread mínimo efetivo (free tem piso de 1% quando cobrança ativa) */
export function spreadMinimoEfetivo(user: PlanUserInfo, minSpread: number): number {
	if (!isCobrancaAtiva()) return minSpread;
	if (user.plan === "free") return Math.max(minSpread, 1.0);
	return minSpread;
}

/** Retorna plano como PlanUserInfo padrão (free) */
export function defaultPlanUserInfo(): PlanUserInfo {
	return {
		plan: "free",
		planActive: true,
		planExpiresAt: null,
		trialUsed: false,
	};
}

/** Mensagem de bloqueio para usuários free (só exibir quando COBRANCA_ATIVA=true) */
export function buildBloqueioMessage(funcionalidade: Funcionalidade): string {
	void funcionalidade; // usado para tracking futuro
	return [
		"🔒 <b>Funcionalidade Pro</b>",
		"",
		"Essa funcao esta disponivel no plano Pro.",
		"",
		"✅ Scanner completo de altcoins",
		"✅ CEX → DeFi (BRLA)",
		"✅ Alertas automaticos ilimitados",
		"✅ Spread minimo configuravel",
		"✅ Silencio noturno",
		"",
		"💎 Plano Pro: R$ 49,90/mes",
	].join("\n");
}

export function buildBloqueioMarkup(): Record<string, unknown> {
	return {
		inline_keyboard: [
			[{ text: "🚀 Quero ser Pro", callback_data: "plan:upgrade" }],
			[{ text: "🏠 Menu", callback_data: "mode:menu" }],
		],
	};
}

export const TRIAL_DAYS = 7;
