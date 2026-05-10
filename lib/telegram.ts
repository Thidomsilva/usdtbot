import type { PricesResponse } from "@/lib/types";
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

type TelegramAction = "menu" | "settings" | "usdt" | "usdt_defi" | "scanner" | "help";

type TelegramCallbackAction = "menu" | TelegramAction;

type TelegramWebhookMessage = {
	message?: {
		chat?: { id?: number | string };
		text?: string;
	};
};

type TelegramMessageOptions = {
	disable_web_page_preview?: boolean;
	reply_markup?: Record<string, unknown>;
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

	if (["/settings", "/config", "config"].includes(command)) {
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

	return null;
}

export function buildTelegramHelpMessage(): string {
	return [
		"<b>USDTBot</b>",
		"",
		"Comandos disponiveis:",
		"/usdt - usdt entre CEXs (compra e venda entre corretoras)",
		"/usdt_defi - compra em CEX e venda no DeFiLlama (BRLA)",
		"/scanner - envia o melhor sinal do scanner completo de moedas",
		"/settings - configura o monitor por usuario",
		"/start - abre o menu com os tres modos",
		"",
		"Se quiser, eu posso responder automaticamente aos dois comandos no mesmo chat.",
	].join("\n");
}

export function buildTelegramMenuMessage(): string {
	return [
		"<b>USDTBot</b> • painel de sinais",
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
			],
		],
	};
}

export function buildTelegramSettingsMessage(options: UsdtMessageOptions): string {
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

	return [
		"<b>⚙️ Configuracoes do monitor</b>",
		"",
		`Envio automatico de sinais: ${autoModeLabel}`,
		"",
		"Escolha o modo automatico abaixo. O bot envia novos sinais sem precisar apertar atualizar.",
	].join("\n");
}

export function buildTelegramSettingsMarkup(options: UsdtMessageOptions): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{
					text: options.autoSignalsMode === "usdt" ? "Auto: 💱 A) CEX↔CEX ✅" : "Auto: 💱 A) CEX↔CEX",
					callback_data: "settings:auto_usdt",
				},
			],
			[
				{
					text:
						options.autoSignalsMode === "scanner"
							? "Auto: 📡 B) Scanner ✅"
							: "Auto: 📡 B) Scanner",
					callback_data: "settings:auto_scanner",
				},
			],
			[
				{
					text:
						options.autoSignalsMode === "usdt_defi"
							? "Auto: 🔗 C) CEX→DeFi ✅"
							: "Auto: 🔗 C) CEX→DeFi",
					callback_data: "settings:auto_usdt_defi",
				},
			],
			[
				{
					text: options.autoSignalsMode === "all" ? "Auto: 🧠 Todas as 3 ✅" : "Auto: 🧠 Todas as 3",
					callback_data: "settings:auto_all",
				},
			],
			[
				{
					text: options.autoSignalsMode === "off" ? "Auto: ⏸️ Desligado ✅" : "Auto: ⏸️ Desligado",
					callback_data: "settings:auto_off",
				},
			],
			[
				{ text: "🏠 Voltar ao menu", callback_data: "mode:menu" },
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
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
			],
		],
	};
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

export function extractTelegramUpdate(update: TelegramWebhookMessage): {
	chatId: number | string | null;
	action: TelegramAction | null;
} {
	const message = update.message;
	const chatId = message?.chat?.id ?? null;
	const action = parseTelegramAction(message?.text);

	return { chatId, action };
}