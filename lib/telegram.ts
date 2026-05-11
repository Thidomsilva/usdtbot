import type { PricesResponse } from "@/lib/types";
import { PAUSE_FOREVER, type TelegramUserSettings } from "@/lib/telegram-user-settings";
import {
	buildBloqueioMarkup,
	buildBloqueioMessage,
	spreadMinimoEfetivo,
	temAcesso,
	type Funcionalidade,
} from "@/lib/plans";
import { createHash } from "crypto";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const DEFI_BRLA_ENDPOINT =
	"https://coins.llama.fi/prices/current/polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb";
const DEFI_BRLA_KEY = "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb";
const DEFI_BRLA_TOTAL_DISCOUNT = 0.005;
const DEFI_BRLA_CACHE_TTL_MS = 15_000;
const DEFI_BRLA_TIMEOUT_MS = 3_000;
const SIM_CAPITAL_BRL = 1000;

type TelegramAction = "menu" | "settings" | "usdt" | "usdt_defi" | "scanner" | "help" | "status";

type TelegramCallbackAction = "menu" | TelegramAction;

type TelegramWebhookMessage = {
	message?: {
		chat?: { id?: number | string };
		text?: string;
	};
};

type TelegramMessageOptions = {
	disable_web_page_preview?: boolean;
	reply_markup?: Record<string, unknown> | null;
};

type UsdtMessageOptions = {
	autoSignalsMode: "off" | "usdt" | "scanner" | "usdt_defi" | "all";
};

type DefiBrlaPrice = {
	brlaUsd: number;
	sellGrossBrlPerUsdt: number;
	sellNetBrlPerUsdt: number;
};

type SellCandidate = {
	label: string;
	priceBrl: number;
	isDefi: boolean;
};

let defiBrlaCache: { expiresAt: number; value: DefiBrlaPrice } | null = null;

function trimEnv(value: string | undefined): string {
	return value?.trim() ?? "";
}

function formatBrl(value: number): string {
	return `R$ ${value.toFixed(4)}`;
}

function formatBrlCompact(value: number): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatPct(value: number, digits = 3): string {
	return `${value.toFixed(digits)}%`;
}

function qualityBadge(quality: "inviavel" | "apertada" | "executavel"): string {
	if (quality === "executavel") return "✅ Executavel";
	if (quality === "apertada") return "🟡 Apertada";
	return "🔴 Inviavel";
}

function buildDateAndTime(value: string): { date: string; time: string } {
	const date = new Date(value);
	return {
		date: date.toLocaleDateString("pt-BR", { timeZone: DEFAULT_TIME_ZONE }),
		time: date.toLocaleTimeString("pt-BR", {
			timeZone: DEFAULT_TIME_ZONE,
			hour: "2-digit",
			minute: "2-digit",
		}),
	};
}

async function fetchDefiBrlaPrice(): Promise<DefiBrlaPrice | null> {
	const now = Date.now();
	if (defiBrlaCache && defiBrlaCache.expiresAt > now) {
		return defiBrlaCache.value;
	}

	try {
		const response = await fetch(DEFI_BRLA_ENDPOINT, {
			method: "GET",
			cache: "no-store",
			signal: AbortSignal.timeout(DEFI_BRLA_TIMEOUT_MS),
			headers: {
				accept: "application/json",
				"user-agent": "usdtbot-telegram/1.0",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = (await response.json()) as {
			coins?: Record<string, { price?: number }>;
		};

		const brlaUsd = Number(payload.coins?.[DEFI_BRLA_KEY]?.price ?? 0);
		if (!Number.isFinite(brlaUsd) || brlaUsd <= 0) {
			throw new Error("Preco BRLA/USD invalido");
		}

		const sellGrossBrlPerUsdt = 1 / brlaUsd;
		const sellNetBrlPerUsdt = sellGrossBrlPerUsdt * (1 - DEFI_BRLA_TOTAL_DISCOUNT);

		const value: DefiBrlaPrice = {
			brlaUsd,
			sellGrossBrlPerUsdt,
			sellNetBrlPerUsdt,
		};

		defiBrlaCache = {
			expiresAt: now + DEFI_BRLA_CACHE_TTL_MS,
			value,
		};

		return value;
	} catch (error) {
		console.warn("[TELEGRAM] DefiLlama BRLA indisponivel:", error);
		return null;
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatTimestamp(value: string): string {
	return new Date(value).toLocaleString("pt-BR", {
		timeZone: DEFAULT_TIME_ZONE,
		dateStyle: "short",
		timeStyle: "short",
	});
}

async function fetchJson<T>(url: URL): Promise<T> {
	const response = await fetch(url, {
		method: "GET",
		cache: "no-store",
		headers: {
			accept: "application/json",
			"user-agent": "usdtbot-telegram/1.0",
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	return (await response.json()) as T;
}

export function getTelegramBotToken(): string | null {
	const token = trimEnv(process.env.TELEGRAM_BOT_TOKEN);
	return token || null;
}

export function getTelegramWebhookSecret(): string | null {
	const secret = trimEnv(process.env.TELEGRAM_WEBHOOK_SECRET);
	return secret || null;
}

export function getAllowedTelegramChatIds(): Set<string> | null {
	const raw = trimEnv(process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_CHAT_ID);
	if (!raw) {
		return null;
	}

	return new Set(
		raw
			.split(/[\s,;]+/)
			.map((value) => value.trim())
			.filter(Boolean)
	);
}

export function isAllowedTelegramChat(chatId: number | string | undefined | null): boolean {
	const allowed = getAllowedTelegramChatIds();
	if (!allowed) {
		return true;
	}

	return chatId !== undefined && chatId !== null ? allowed.has(String(chatId)) : false;
}

export function parseTelegramAction(text: string | undefined): TelegramAction | null {
	const command = trimEnv(text).split(/\s+/)[0]?.toLowerCase() ?? "";

	if (["/start", "/menu"].includes(command)) {
		return "menu";
	}

	if (["/help", "ajuda", "help"].includes(command)) {
		return "help";
	}

	if (["/settings", "/config", "config", "/configurar", "configurar"].includes(command)) {
		return "settings";
	}

	if (["/usdt", "/signal_usdt", "/usdt_signal", "usdt"].includes(command)) {
		return "usdt";
	}

	if (["/usdt_defi", "/defi", "/signal_defi", "defi"].includes(command)) {
		return "usdt_defi";
	}

	if (["/scanner", "/signal_scanner", "/scanner_signal", "scanner"].includes(command)) {
		return "scanner";
	}

	if (["/status", "status"].includes(command) || command.startsWith("/status@")) {
		return "status";
	}

	return null;
}

export function buildTelegramHelpMessage(): string {
	return [
		"<b>USDTBot</b>",
		"",
		"Comandos disponiveis:",
		"/cadastro email senha - cria sua conta e vincula este chat",
		"/login email senha - autentica e libera este chat",
		"/logout - remove o vinculo deste chat",
		"/usdt - usdt entre CEXs (compra e venda entre corretoras)",
		"/usdt_defi - compra em CEX e venda no DeFiLlama (BRLA)",
		"/scanner - envia o melhor sinal do scanner completo de moedas",
		"/settings - configura o monitor por usuario",
		"/status - mostra o status atual do monitoramento",
		"/start - abre o menu com os tres modos",
		"",
		"Se quiser, eu posso responder automaticamente aos dois comandos no mesmo chat.",
	].join("\n");
}

export function buildTelegramAuthRequiredMessage(): string {
	return [
		"<b>🔐 Acesso Restrito</b>",
		"",
		"Olá! Para usar este bot você precisa se autenticar.",
		"",
		"Use os botões abaixo para entrar ou criar sua conta.",
		"",
		"💡 <i>Depois da autenticação você terá acesso a:</i>",
		"✅ Menu completo de operações",
		"✅ Sinais de arbitragem em tempo real",
		"✅ Monitoramento automático 24/7",
		"✅ Configuração de preferências",
		"",
		"Se preferir, também pode usar:",
		"<code>/login seu_email sua_senha</code>",
		"<code>/cadastro seu_email sua_senha</code>",
	].join("\n");
}

export function buildTelegramAuthRequiredMarkup(): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{ text: "🔑 Login", callback_data: "account:login" },
				{ text: "🆕 Cadastro", callback_data: "account:cadastro" },
			],
			[
				{ text: "❓ Ajuda", callback_data: "account:help" },
			],
		],
	};
}

export function parseTelegramCredentialsCommand(
	text: string | undefined
): { command: "login" | "cadastro"; username: string; password: string } | null {
	const normalized = trimEnv(text);
	if (!normalized) return null;

	const parts = normalized.split(/\s+/).filter(Boolean);
	const command = parts[0]?.toLowerCase() ?? "";
	if (command !== "/login" && command !== "/cadastro") {
		return null;
	}

	const username = parts[1]?.trim().toLowerCase() ?? "";
	const password = parts.slice(2).join(" ").trim();
	if (!username || !password) {
		return {
			command: command === "/login" ? "login" : "cadastro",
			username: "",
			password: "",
		};
	}

	return {
		command: command === "/login" ? "login" : "cadastro",
		username,
		password,
	};
}

export function buildTelegramMenuMessage(): string {
	return [
		"🦊 <b>Comunidade FOX</b>",
		"",
		"Seja bem vindo! 👋",
		"",
		"Escolha a trilha que quer acompanhar agora:",
		"",
		"<b>A) USDT entre CEXs</b>",
		"Compra e venda entre corretoras centralizadas.",
		"",
		"<b>B) Scanner</b>",
		"Scanner completo do mercado cripto com ranking de oportunidades.",
		"",
		"<b>C) USDT -> DeFiLlama (BRLA)</b>",
		"Compra em CEX e simula venda no DeFi (pool BRLA/USDT).",
		"",
		"Toque em um botao para receber o sinal na hora.",
	].join("\n");
}

export function buildTelegramMenuMarkup(): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{ text: "💱 A) CEX↔CEX", callback_data: "mode:usdt" },
			],
			[
				{ text: "📡 B) Scanner", callback_data: "mode:scanner" },
			],
			[
				{ text: "🔗 C) CEX→DeFi", callback_data: "mode:usdt_defi" },
			],
			[
				{ text: "⚙️ Configurar", callback_data: "settings:open" },
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
				{ text: "🚪 Logout", callback_data: "account:logout" },
			],
		],
	};
}

function isAlertsPaused(settings: TelegramUserSettings): boolean {
	if (settings.pausedUntil === PAUSE_FOREVER) return true;
	return settings.pausedUntil !== null && settings.pausedUntil > Date.now();
}

function pauseResumeLabel(settings: TelegramUserSettings): string {
	if (settings.pausedUntil === PAUSE_FOREVER) return "indefinidamente";
	if (settings.pausedUntil !== null && settings.pausedUntil > Date.now()) {
		return new Date(settings.pausedUntil).toLocaleTimeString("pt-BR", {
			timeZone: "America/Sao_Paulo",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return "agora";
}

function formatDispatchTime(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function simplifyDispatchReason(reason: string | null): string {
	if (!reason) return "sem detalhes";
	const normalized = reason.replace(/^track_[abc]_/, "");

	if (normalized === "no_spread_or_data") return "sem oportunidade acima do minimo";
	if (normalized === "cooldown") return "aguardando cooldown";
	if (normalized === "paused") return "monitor pausado";
	if (normalized === "silent") return "silencio noturno";
	if (normalized === "ratelimit") return "limite horario atingido";
	if (normalized === "plan") return "limitado pelo plano";
	if (normalized === "disabled") return "trilha desativada";
	if (normalized === "exception") return "erro interno";
	if (normalized === "message_empty") return "mensagem vazia";

	return normalized;
}

function buildTrackDispatchStatusLine(params: {
	label: "A" | "B" | "C";
	enabled: boolean;
	hasAccess: boolean;
	at: number | null;
	status: "sent" | "skipped" | "failed" | null;
	reason: string | null;
}): string | null {
	if (!params.enabled || !params.hasAccess) return null;
	if (params.at === null || params.status === null) {
		return `${params.label}: aguardando primeira verificacao`;
	}

	const when = formatDispatchTime(params.at);
	if (params.status === "sent") {
		return `${params.label}: ${when} enviado ✅`;
	}

	if (params.status === "failed") {
		return `${params.label}: ${when} falhou (${simplifyDispatchReason(params.reason)})`;
	}

	return `${params.label}: ${when} sem envio (${simplifyDispatchReason(params.reason)})`;
}

export function buildTelegramSettingsMessage(options: TelegramUserSettings): string {
	const autoModeLabel =
		options.autoSignalsMode === "usdt"
			? "💱 A) USDT entre CEXs"
			: options.autoSignalsMode === "scanner"
				? "📡 B) Scanner"
				: options.autoSignalsMode === "usdt_defi"
					? "🔗 C) USDT -> DeFi"
					: options.autoSignalsMode === "all"
						? "🧠 Todas as 3"
						: "⏸️ Desligado";

	const alertIcon = options.alertsEnabled ? "✅" : "❌";
	const silentIcon = options.silentNight ? "✅" : "❌";
	const pausedMsg = isAlertsPaused(options)
		? options.pausedUntil === PAUSE_FOREVER
			? "\n⏸️ Pausado indefinidamente"
			: `\n⏸️ Pausado até ${pauseResumeLabel(options)}`
		: "";
	const planLabel = options.plan === "pro" ? "⭐ Pro" : "🆓 Free";
	const tracks = options.alertTracks;

	return [
		"<b>⚙️ Configuracoes</b>",
		"",
		`Plano: ${planLabel}`,
		`Alertas automaticos: ${alertIcon}${pausedMsg}`,
		`Trilhas ativas: ${tracks.a ? "💱A" : "━A"} ${tracks.b ? "✅B" : "━B"} ${tracks.c ? "🔗C" : "━C"}`,
		`Spread minimo A: ${options.minSpreadA.toFixed(2)}%`,
		`Spread minimo B: ${options.minSpreadB.toFixed(2)}%`,
		`Spread minimo C: ${options.minSpreadC.toFixed(2)}%`,
		`Capital simulado: R$ ${options.simCapital.toLocaleString("pt-BR")}`,
		`Silencio noturno: ${silentIcon} ${options.silentStart}–${options.silentEnd}`,
		"",
		"Envio sob demanda (auto-sinal):",
		autoModeLabel,
	].join("\n");
}

export function buildTelegramSettingsMarkup(options: TelegramUserSettings): Record<string, unknown> {
	const { alertsEnabled, alertTracks, autoSignalsMode, plan } = options;
	return {
		inline_keyboard: [
			// row 0: spread editor
			[
				{ text: "📈 Ajustar spread minimo", callback_data: "settings:spread_adjust" },
			],
			// row 1: toggle alerts on/off
			[{
				text: alertsEnabled ? "🔔 Alertas: LIGADO ✅" : "🔕 Alertas: DESLIGADO ❌",
				callback_data: alertsEnabled ? "alerts:off" : "alerts:on",
			}],
			// row 2: track toggles
			[
				{ text: alertTracks.a ? "💱A ✅" : "💱A ❌", callback_data: alertTracks.a ? "track:a_off" : "track:a_on" },
				{ text: alertTracks.b ? "📡B ✅" : "📡B ❌", callback_data: alertTracks.b ? "track:b_off" : "track:b_on" },
				{ text: alertTracks.c ? "🔗C ✅" : "🔗C ❌", callback_data: alertTracks.c ? "track:c_off" : "track:c_on" },
			],
			// row 3: capital presets
			[
				{ text: `R$500${options.simCapital === 500 ? "✅" : ""}`, callback_data: "capital:500" },
				{ text: `R$1k${options.simCapital === 1000 ? "✅" : ""}`, callback_data: "capital:1000" },
				{ text: `R$5k${options.simCapital === 5000 ? "✅" : ""}`, callback_data: "capital:5000" },
				{ text: `R$10k${options.simCapital === 10000 ? "✅" : ""}`, callback_data: "capital:10000" },
			],
			// row 4: silent night toggle
			[{
				text: options.silentNight ? "🌙 Silencio noturno: ON ✅" : "🌙 Silencio noturno: OFF",
				callback_data: options.silentNight ? "silent:off" : "silent:on",
			}],
			// row 5: auto signal mode
			[
				{ text: autoSignalsMode === "usdt" ? "Auto: 💱A ✅" : "Auto: 💱A", callback_data: "settings:auto_usdt" },
				{ text: autoSignalsMode === "scanner" ? "Auto: 📡B ✅" : "Auto: 📡B", callback_data: "settings:auto_scanner" },
				{ text: autoSignalsMode === "usdt_defi" ? "Auto: 🔗C ✅" : "Auto: 🔗C", callback_data: "settings:auto_usdt_defi" },
			],
			[
				{ text: autoSignalsMode === "all" ? "Auto: 🧠 Todas ✅" : "Auto: 🧠 Todas", callback_data: "settings:auto_all" },
				{ text: autoSignalsMode === "off" ? "Auto: ⏸️ Off ✅" : "Auto: ⏸️ Off", callback_data: "settings:auto_off" },
			],
			// row 6: pause
			...(plan === "free" ? [] : [[
				{ text: "🔕 Pausar 1h", callback_data: "pause:1h" },
				{ text: "🔕 Pausar 4h", callback_data: "pause:4h" },
				{ text: "🔕 Pausar 24h", callback_data: "pause:24h" },
			]]),
			// back
			[
				{ text: "🏠 Voltar ao menu", callback_data: "mode:menu" },
				{ text: "🚪 Logout", callback_data: "account:logout" },
			],
		],
	};
}

export function buildSignalDigest(message: string): string {
	const lines = message.split("\n");
	const normalized = lines.slice(1).join("\n").trim();
	return createHash("sha256").update(normalized).digest("hex");
}

export function buildTelegramSignalMarkup(action: "usdt" | "scanner" | "usdt_defi"): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{
					text:
						action === "usdt"
							? "🔄 Atualizar A) CEX↔CEX"
							: action === "usdt_defi"
								? "🔄 Atualizar C) CEX→DeFi"
								: "🔄 Atualizar B) Scanner",
					callback_data: `mode:${action}`,
				},
			],
			[
				{ text: "💱 A) CEX↔CEX", callback_data: "mode:usdt" },
				{ text: "📡 B) Scanner", callback_data: "mode:scanner" },
			],
			[
				{ text: "🔗 C) CEX→DeFi", callback_data: "mode:usdt_defi" },
			],
			[
				{ text: "⚙️ Configurar", callback_data: "settings:open" },
				{ text: "🔕 Pausar", callback_data: "pause:menu" },
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
				{ text: "🚪 Logout", callback_data: "account:logout" },
			],
		],
	};
}

export function buildPauseMenuMarkup(): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{ text: "🔕 1 hora", callback_data: "pause:1h" },
				{ text: "🔕 4 horas", callback_data: "pause:4h" },
			],
			[
				{ text: "🔕 24 horas", callback_data: "pause:24h" },
				{ text: "🔕 Indefinido", callback_data: "pause:forever" },
			],
			[
				{ text: "🔔 Manter ativo", callback_data: "settings:open" },
			],
		],
	};
}

export function buildPauseConfirmMessage(pausedUntil: number | null): string {
	if (pausedUntil === PAUSE_FOREVER) {
		return "🔕 Alertas pausados por tempo indefinido.\nDigite /status para checar e retomar quando quiser.";
	}
	if (pausedUntil === null) {
		return "🔔 Alertas retomados.";
	}
	const hora = new Date(pausedUntil).toLocaleTimeString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `🔕 Alertas pausados. Retomam às ${hora}.`;
}

export function buildMonitoringStatusMessage(settings: TelegramUserSettings): string {
	const paused = isAlertsPaused(settings);
	const silence = settings.silentNight
		? `${settings.silentStart} — ${settings.silentEnd}`
		: "desativado";
	const planInfo = {
		plan: settings.plan,
		planActive: settings.planActive,
		planExpiresAt: settings.planExpiresAt,
		trialUsed: settings.trialUsed,
	};
	const hasAccessA = temAcesso(planInfo, "trilha_a");
	const hasAccessB = temAcesso(planInfo, "trilha_b");
	const hasAccessC = temAcesso(planInfo, "trilha_c");
	const effectiveMinSpreadA = spreadMinimoEfetivo(planInfo, settings.minSpreadA);
	const dispatchLines = [
		buildTrackDispatchStatusLine({
			label: "A",
			enabled: settings.alertTracks.a,
			hasAccess: hasAccessA,
			at: settings.lastDispatchAtA,
			status: settings.lastDispatchStatusA,
			reason: settings.lastDispatchReasonA,
		}),
		buildTrackDispatchStatusLine({
			label: "B",
			enabled: settings.alertTracks.b,
			hasAccess: hasAccessB,
			at: settings.lastDispatchAtB,
			status: settings.lastDispatchStatusB,
			reason: settings.lastDispatchReasonB,
		}),
		buildTrackDispatchStatusLine({
			label: "C",
			enabled: settings.alertTracks.c,
			hasAccess: hasAccessC,
			at: settings.lastDispatchAtC,
			status: settings.lastDispatchStatusC,
			reason: settings.lastDispatchReasonC,
		}),
	].filter((line): line is string => Boolean(line));

	if (paused) {
		const resume = settings.pausedUntil === PAUSE_FOREVER
			? "indefinidamente"
			: pauseResumeLabel(settings);
		return [
			"✅ <b>MONITORAMENTO PAUSADO 🔕</b>",
			"",
			`Trilha A CEX→CEX    ${hasAccessA ? "⏸ pausado" : "🔒 indisponivel no plano"}`,
			`Trilha B Scanner    ${hasAccessB ? "⏸ pausado" : "🔒 indisponivel no plano"}`,
			`Trilha C CEX→DeFi   ${hasAccessC ? "⏸ pausado" : "🔒 indisponivel no plano"}`,
			"",
			`Retoma em: ${resume}`,
		].join("\n");
	}

	if (!settings.alertsEnabled) {
		return [
			"✅ <b>MONITORAMENTO DESATIVADO</b>",
			"",
			"Trilha A CEX→CEX    ❌ desativada",
			"Trilha B Scanner    ❌ desativada",
			"Trilha C CEX→DeFi   ❌ desativada",
			"",
			"Ative os alertas para iniciar o monitoramento.",
		].join("\n");
	}

	return [
		"✅ <b>MONITORAMENTO ATIVO</b>",
		"",
		`Trilha A CEX→CEX    ${!hasAccessA ? "🔒 indisponivel no plano" : settings.alertTracks.a ? `✅ ${effectiveMinSpreadA.toFixed(2)}% mín` : "❌ desativada"}`,
		`Trilha B Scanner    ${!hasAccessB ? "🔒 indisponivel no plano" : settings.alertTracks.b ? `✅ ${settings.minSpreadB.toFixed(2)}% mín` : "❌ desativada"}`,
		`Trilha C CEX→DeFi   ${!hasAccessC ? "🔒 indisponivel no plano" : settings.alertTracks.c ? `✅ ${settings.minSpreadC.toFixed(2)}% mín` : "❌ desativada"}`,
		"",
		`💰 Simulando R$ ${settings.simCapital.toLocaleString("pt-BR")}`,
		`🔕 Silencio: ${silence}`,
		"⏱ Verificando a cada 1 min",
		...(dispatchLines.length > 0
			? ["", "🧪 Ultima verificacao automatica", ...dispatchLines]
			: []),
		"",
		"Te aviso quando aparecer oportunidade acima do limite!",
	].join("\n");
}

export function buildMonitoringStatusMarkup(settings: TelegramUserSettings): Record<string, unknown> {
	if (isAlertsPaused(settings)) {
		return {
			inline_keyboard: [
				[
					{ text: "▶️ Retomar agora", callback_data: "pause:resume" },
					{ text: "⚙️ Ajustar", callback_data: "settings:open" },
				],
				[
					{ text: "🏠 Menu", callback_data: "mode:menu" },
				],
			],
		};
	}

	return {
		inline_keyboard: [
			[
				{ text: "⚙️ Ajustar", callback_data: "settings:open" },
				{ text: "🔕 Pausar tudo", callback_data: "pause:menu" },
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
			],
		],
	};
}

export function buildOnboardingMessage(): string {
	return [
		"✅ <b>Alertas automaticos ativados!</b>",
		"",
		"Vou te avisar quando aparecer oportunidade acima do seu limite.",
		"",
		"Use ⚙️ Configurar para ajustar:",
		"• Spread minimo (trilhas A, B, C)",
		"• Capital de simulacao",
		"• Horario de silencio noturno",
	].join("\n");
}

export async function buildAlertUsdtMessage(
	baseUrl: string,
	settings: TelegramUserSettings,
	minSpreadPct = settings.minSpreadA
): Promise<string | null> {
	const prices = await fetchJson<PricesResponse>(new URL("/api/prices", baseUrl));
	const entries = Object.values(prices.exchanges).filter(
		(e) => e.status === "ok" && typeof e.price_brl === "number" && e.price_brl > 0
	);

	if (entries.length < 2) return null;

	const sorted = entries.slice().sort((a, b) => (a.price_brl ?? 0) - (b.price_brl ?? 0));
	const buy = sorted[0];
	const sell = sorted[sorted.length - 1];
	const buyPrice = buy.price_brl ?? 0;
	const sellPrice = sell.price_brl ?? 0;
	if (buyPrice <= 0 || sellPrice <= 0) return null;
	const spreadPct = ((sellPrice - buyPrice) / buyPrice) * 100;

	if (spreadPct < minSpreadPct) return null;

	const capital = settings.simCapital;
	const usdtQty = capital / buyPrice;
	const profit = usdtQty * sellPrice - capital;

	const { time } = buildDateAndTime(prices.timestamp);

	return [
		"🔔 <b>ALERTA CEX→CEX</b>",
		"",
		`⬇️ Compra: ${escapeHtml(buy.label)} ${formatBrl(buyPrice)}`,
		`⬆️ Venda: ${escapeHtml(sell.label)} ${formatBrl(sellPrice)}`,
		`📈 Spread: ${formatPct(spreadPct, 2)} liquido`,
		`💰 ${formatBrlCompact(capital)} → lucro estimado ${formatBrlCompact(profit)}`,
		"",
		`⏱ ${time}`,
	].join("\n");
}

export async function buildAlertScannerMessage(baseUrl: string, settings: TelegramUserSettings): Promise<{ message: string; key: string } | null> {
	const payload = await fetchJson<{
		timestamp: string;
		tokens: Array<{
			symbol: string;
			status: "ok" | "error";
			best_arb?: {
				buy_exchange_label: string;
				sell_exchange_label: string;
				spread_pct: number;
				net_spread_pct: number;
				quality: "inviavel" | "apertada" | "executavel";
				profit_est_brl_per_100: number;
			};
		}>;
	}>(new URL("/api/fan-tokens", baseUrl));

	const best = payload.tokens
		.filter((t) => t.status === "ok" && t.best_arb && t.best_arb.net_spread_pct >= settings.minSpreadB)
		.sort((a, b) => (b.best_arb?.net_spread_pct ?? 0) - (a.best_arb?.net_spread_pct ?? 0))[0];

	if (!best || !best.best_arb) return null;

	const { time } = buildDateAndTime(payload.timestamp);
	const arb = best.best_arb;
	const profitPer100 = arb.profit_est_brl_per_100;
	const key = `${best.symbol}|${arb.buy_exchange_label}|${arb.sell_exchange_label}`;

	const message = [
		`🔔 <b>ALERTA SCANNER — ${escapeHtml(best.symbol)}</b>`,
		"",
		`${escapeHtml(arb.buy_exchange_label)} → ${escapeHtml(arb.sell_exchange_label)}`,
		`📈 ${formatPct(arb.spread_pct, 2)} bruto · ${formatPct(arb.net_spread_pct, 2)} liquido`,
		`${qualityBadge(arb.quality)}`,
		`💰 ${formatBrlCompact(profitPer100)} por R$ 100`,
		"",
		`⏱ ${time}`,
	].join("\n");

	return { message, key };
}

export async function buildAlertUsdtDefiMessage(baseUrl: string, settings: TelegramUserSettings): Promise<string | null> {
	const prices = await fetchJson<PricesResponse>(new URL("/api/prices", baseUrl));
	const entries = Object.values(prices.exchanges).filter(
		(e) => e.status === "ok" && typeof e.price_brl === "number" && e.price_brl > 0
	);

	if (entries.length < 1) return null;

	const buy = entries.slice().sort((a, b) => (a.price_brl ?? 0) - (b.price_brl ?? 0))[0];
	const buyPrice = buy.price_brl ?? 0;
	const defi = await fetchDefiBrlaPrice();

	if (!defi || buyPrice <= 0) return null;

	const sellDefi = defi.sellNetBrlPerUsdt;
	const spreadPct = ((sellDefi - buyPrice) / buyPrice) * 100;

	if (spreadPct < settings.minSpreadC) return null;

	const capital = settings.simCapital;
	const usdtQty = capital / buyPrice;
	const profit = usdtQty * sellDefi - capital;
	const { time } = buildDateAndTime(prices.timestamp);

	return [
		"🔔 <b>ALERTA CEX→DeFi</b>",
		"",
		`⬇️ Compra: ${escapeHtml(buy.label)} ${formatBrl(buyPrice)}`,
		`⬆️ Venda: DeFi BRLA ${formatBrl(Number(sellDefi.toFixed(4)))}`,
		`📈 Spread: ${formatPct(spreadPct, 2)} liquido`,
		`💰 ${formatBrlCompact(capital)} → lucro estimado ${formatBrlCompact(profit)}`,
		"⚠️ Taxa DeFi estimada 0.50% ja descontada",
		"",
		`⏱ ${time}`,
	].join("\n");
}

export async function buildUsdtSignalMessage(
	baseUrl: string,
	options: UsdtMessageOptions
): Promise<string> {
	const prices = await fetchJson<PricesResponse>(new URL("/api/prices", baseUrl));
	const summary = prices.summary;
	const entries = Object.values(prices.exchanges).filter(
		(exchange) => exchange.status === "ok" && typeof exchange.price_brl === "number" && exchange.price_brl > 0
	);
	const { date, time } = buildDateAndTime(prices.timestamp);

	if (entries.length < 2 || !summary) {
		return [
			`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
			"",
			"⚠️ Nao ha duas corretoras validas para montar um sinal agora.",
			"",
			"Toque em <b>Atualizar USDT</b> para tentar novamente.",
		].join("\n");
	}

	const sorted = entries.slice().sort((a, b) => (a.price_brl ?? 0) - (b.price_brl ?? 0));
	const buy = sorted[0];
	const buyPrice = buy.price_brl ?? 0;

	const sellCandidates: SellCandidate[] = entries
		.map((exchange) => ({
			label: exchange.label,
			priceBrl: exchange.price_brl ?? 0,
			isDefi: false,
		}))
		.filter((candidate) => candidate.priceBrl > 0);

	const rankedSells = sellCandidates
		.slice()
		.sort((a, b) => b.priceBrl - a.priceBrl)
		.slice(0, 6);

	const bestSell = rankedSells[0] ?? null;
	if (!bestSell || buyPrice <= 0) {
		return [
			`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
			"",
			"⚠️ Nao foi possivel montar ranking de venda agora.",
		].join("\n");
	}

	const usdtQty = SIM_CAPITAL_BRL / buyPrice;
	const bestReturnBrl = usdtQty * bestSell.priceBrl;
	const bestProfitBrl = bestReturnBrl - SIM_CAPITAL_BRL;

	const rankingLines = rankedSells.map((candidate) => {
		const spreadPct = ((candidate.priceBrl - buyPrice) / buyPrice) * 100;
		const trend = spreadPct >= 0 ? "🟢" : "🔴";
		const winner = candidate.label === bestSell.label ? " 🏆" : "";
		const label = candidate.isDefi ? "🔗 DeFi BRLA" : candidate.label;
		return `   ${trend} ${label}: ${formatBrl(candidate.priceBrl)}  ${formatPct(spreadPct, 2)}${winner}`;
	});

	return [
		`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
		"",
		"<b>A) USDT entre CEXs</b>",
		"",
		"⬇️ <b>COMPRA mais barata</b>",
		`   ${escapeHtml(buy.label)}: ${formatBrl(buyPrice)}`,
		"",
		"⬆️ <b>VENDA — ranking</b>",
		...rankingLines,
		"",
		`💰 <b>Melhor rota</b>: ${escapeHtml(buy.label)} -> ${escapeHtml(bestSell.label)}`,
		`   Capital ${formatBrlCompact(SIM_CAPITAL_BRL)} -> lucro estimado ${formatBrlCompact(bestProfitBrl)}`,
		"",
		`📊 <b>Media</b>: ${formatBrl(summary.avg)} | <b>Faixa</b>: ${formatBrl(summary.min)} — ${formatBrl(summary.max)}`,
	].join("\n");
}

export async function buildUsdtDefiSignalMessage(baseUrl: string): Promise<string> {
	const prices = await fetchJson<PricesResponse>(new URL("/api/prices", baseUrl));
	const entries = Object.values(prices.exchanges).filter(
		(exchange) => exchange.status === "ok" && typeof exchange.price_brl === "number" && exchange.price_brl > 0
	);
	const { date, time } = buildDateAndTime(prices.timestamp);

	if (entries.length < 1) {
		return [
			`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
			"",
			"<b>C) USDT -> DeFiLlama (BRLA)</b>",
			"",
			"⚠️ Sem preco de compra em CEX disponivel agora.",
		].join("\n");
	}

	const buy = entries.slice().sort((a, b) => (a.price_brl ?? 0) - (b.price_brl ?? 0))[0];
	const buyPrice = buy.price_brl ?? 0;
	const defi = await fetchDefiBrlaPrice();

	if (!defi || buyPrice <= 0) {
		return [
			`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
			"",
			"<b>C) USDT -> DeFiLlama (BRLA)</b>",
			"",
			`⬇️ Compra CEX: ${escapeHtml(buy.label)} a ${formatBrl(buyPrice)}`,
			"⚠️ DeFiLlama indisponivel no momento (timeout/falha).",
		].join("\n");
	}

	const sellDefi = Number(defi.sellNetBrlPerUsdt.toFixed(4));
	const spreadPct = ((sellDefi - buyPrice) / buyPrice) * 100;
	const usdtQty = SIM_CAPITAL_BRL / buyPrice;
	const profit = usdtQty * sellDefi - SIM_CAPITAL_BRL;

	return [
		`<b>💵 USDT/BRL · ${date} · ${time}</b>`,
		"",
		"<b>C) USDT -> DeFiLlama (BRLA)</b>",
		"",
		"⬇️ <b>COMPRA em CEX</b>",
		`   ${escapeHtml(buy.label)}: ${formatBrl(buyPrice)}`,
		"",
		"⬆️ <b>VENDA no DeFi</b>",
		`   🔗 DeFi BRLA: ${formatBrl(sellDefi)}  ${formatPct(spreadPct, 2)}`,
		"",
		`💰 <b>Melhor rota</b>: ${escapeHtml(buy.label)} -> 🔗 DeFi BRLA`,
		`   Capital ${formatBrlCompact(SIM_CAPITAL_BRL)} -> lucro estimado ${formatBrlCompact(profit)}`,
		"⚠️ DeFi BRLA inclui taxa estimada de 0.50%.",
	].join("\n");
}

export async function buildScannerSignalMessage(baseUrl: string): Promise<string> {
	const payload = await fetchJson<{
		timestamp: string;
		tokens: Array<{
			symbol: string;
			team: string;
			status: "ok" | "error";
			best_arb?: {
				buy_exchange_label: string;
				sell_exchange_label: string;
				spread_pct: number;
				net_spread_pct: number;
				quality: "inviavel" | "apertada" | "executavel";
				profit_est_brl_per_100: number;
			};
		}>
	}>(new URL("/api/fan-tokens", baseUrl));

	const candidates = payload.tokens
		.filter((token) => token.status === "ok" && token.best_arb)
		.sort((a, b) => (b.best_arb?.spread_pct ?? 0) - (a.best_arb?.spread_pct ?? 0));

	const best = candidates[0] ?? null;
	if (!best || !best.best_arb) {
		return [
			`<b>🔎 SCANNER · ${formatTimestamp(payload.timestamp)}</b>`,
			"",
			"⚠️ Nao encontrei oportunidade valida no scanner completo agora.",
			"",
			"Toque em <b>Atualizar Scanner</b> para tentar novamente.",
		].join("\n");
	}

	const topThree = candidates.slice(0, 3);
	const { date, time } = buildDateAndTime(payload.timestamp);

	return [
		`<b>🔎 SCANNER · ${date} · ${time}</b>`,
		"",
		`🥇 <b>${escapeHtml(best.symbol)}</b> · ${escapeHtml(best.best_arb.buy_exchange_label)} -> ${escapeHtml(best.best_arb.sell_exchange_label)}`,
		`📈 ${formatPct(best.best_arb.spread_pct, 2)} bruto · ${formatPct(best.best_arb.net_spread_pct, 2)} liquido · ${qualityBadge(best.best_arb.quality)}`,
		`💰 ${formatBrlCompact(best.best_arb.profit_est_brl_per_100)} por cada R$ 100`,
		"",
		"<b>Top 3 sinais</b>",
		...topThree.map((token, index) => {
			const arb = token.best_arb;
			if (!arb) {
				return `${index + 1}. ${escapeHtml(token.symbol)} - sem sinal`;
			}

			const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
			return `${medal} <b>${escapeHtml(token.symbol)}</b> · ${escapeHtml(arb.buy_exchange_label)} -> ${escapeHtml(arb.sell_exchange_label)}\n📈 ${formatPct(arb.spread_pct, 2)} bruto · ${formatPct(arb.net_spread_pct, 2)} liquido`;
		}),
	].join("\n");
}

export async function sendTelegramMessage(
	chatId: number | string,
	text: string,
	options: TelegramMessageOptions = {}
): Promise<void> {
	const token = getTelegramBotToken();
	if (!token) {
		throw new Error("TELEGRAM_BOT_TOKEN nao configurado");
	}

	const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			chat_id: chatId,
			text,
			parse_mode: "HTML",
			disable_web_page_preview: true,
			...options,
		}),
	});

	if (!response.ok) {
		throw new Error(`Telegram API HTTP ${response.status}`);
	}
}

export async function clearTelegramMessageReplyMarkup(
	chatId: number | string,
	messageId: number
): Promise<void> {
	const token = getTelegramBotToken();
	if (!token) {
		throw new Error("TELEGRAM_BOT_TOKEN nao configurado");
	}

	const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/editMessageReplyMarkup`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			chat_id: chatId,
			message_id: messageId,
			reply_markup: { inline_keyboard: [] },
		}),
	});

	if (!response.ok) {
		throw new Error(`Telegram API HTTP ${response.status}`);
	}
}

export async function deleteTelegramMessage(
	chatId: number | string,
	messageId: number
): Promise<void> {
	const token = getTelegramBotToken();
	if (!token) {
		throw new Error("TELEGRAM_BOT_TOKEN nao configurado");
	}

	const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/deleteMessage`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			chat_id: chatId,
			message_id: messageId,
		}),
	});

	if (!response.ok) {
		throw new Error(`Telegram API HTTP ${response.status}`);
	}
}

export { buildBloqueioMessage, buildBloqueioMarkup, temAcesso };
export type { Funcionalidade };

export async function sendBloqueioMessage(
	chatId: number | string,
	funcionalidade: Funcionalidade
): Promise<void> {
	await sendTelegramMessage(chatId, buildBloqueioMessage(funcionalidade), {
		reply_markup: buildBloqueioMarkup(),
	});
}

export function extractTelegramUpdate(update: TelegramWebhookMessage): {
	chatId: number | string | null;
	action: TelegramAction | null;
} {
	const message = update.message;
	const chatId = message?.chat?.id ?? null;
	const action = parseTelegramAction(message?.text);

	return { chatId, action };
}