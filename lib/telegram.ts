import type { PricesResponse } from "@/lib/types";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type TelegramAction = "menu" | "usdt" | "scanner" | "help";

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

function trimEnv(value: string | undefined): string {
	return value?.trim() ?? "";
}

function formatBrl(value: number): string {
	return `R$ ${value.toFixed(4)}`;
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

	if (["/usdt", "/signal_usdt", "/usdt_signal", "usdt"].includes(command)) {
		return "usdt";
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
		"/usdt - envia o melhor sinal do monitor USDT/BRL",
		"/scanner - envia o melhor sinal do scanner de fan tokens",
		"/start - abre o menu bonito com os dois modos",
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
		"<b>UsdtBot</b>",
		"Monitor USDT/BRL entre corretoras e destaque de melhor compra/venda.",
		"",
		"<b>Scanner Bot</b>",
		"Scanner de fan tokens com melhor oportunidade, spread liquido e top 3 sinais.",
		"",
		"Toque em um botao para receber o sinal na hora.",
	].join("\n");
}

export function buildTelegramMenuMarkup(): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{ text: "💱 UsdtBot", callback_data: "mode:usdt" },
				{ text: "📡 Scanner Bot", callback_data: "mode:scanner" },
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
			],
		],
	};
}

export function buildTelegramSignalMarkup(action: "usdt" | "scanner"): Record<string, unknown> {
	return {
		inline_keyboard: [
			[
				{ text: action === "usdt" ? "🔄 Atualizar USDT" : "🔄 Atualizar Scanner", callback_data: `mode:${action}` },
			],
			[
				{ text: "💱 UsdtBot", callback_data: "mode:usdt" },
				{ text: "📡 Scanner Bot", callback_data: "mode:scanner" },
			],
			[
				{ text: "🏠 Menu", callback_data: "mode:menu" },
			],
		],
	};
}

export async function buildUsdtSignalMessage(baseUrl: string): Promise<string> {
	const prices = await fetchJson<PricesResponse>(new URL("/api/prices", baseUrl));
	const summary = prices.summary;
	const entries = Object.values(prices.exchanges).filter(
		(exchange) => exchange.status === "ok" && typeof exchange.price_brl === "number" && exchange.price_brl > 0
	);

	if (entries.length < 2 || !summary) {
		return [
			"<b>💱 UsdtBot</b>",
			"",
			"Nao ha duas corretoras validas para montar um sinal agora.",
			`Atualizado: ${formatTimestamp(prices.timestamp)}`,
		].join("\n");
	}

	const sorted = entries.slice().sort((a, b) => (a.price_brl ?? 0) - (b.price_brl ?? 0));
	const buy = sorted[0];
	const sell = sorted[sorted.length - 1];
	const buyPrice = buy.price_brl ?? 0;
	const sellPrice = sell.price_brl ?? 0;
	const spreadPct = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0;

	return [
		"<b>💱 UsdtBot</b>",
		"",
		"Melhor rota agora para leitura rapida do par USDT/BRL.",
		"",
		`<b>Compra</b>: ${escapeHtml(buy.label)} a <b>${formatBrl(buyPrice)}</b>`,
		`<b>Venda</b>: ${escapeHtml(sell.label)} a <b>${formatBrl(sellPrice)}</b>`,
		`<b>Spread bruto</b>: ${spreadPct.toFixed(3)}%`,
		`<b>Média monitorada</b>: ${formatBrl(summary.avg)}`,
		`<b>Faixa</b>: ${formatBrl(summary.min)} - ${formatBrl(summary.max)}`,
		`<b>Atualizado</b>: ${formatTimestamp(prices.timestamp)}`,
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
			"<b>📡 Scanner Bot</b>",
			"",
			"Nao encontrei oportunidade valida agora.",
			`Atualizado: ${formatTimestamp(payload.timestamp)}`,
		].join("\n");
	}

	const topThree = candidates.slice(0, 3);

	return [
		"<b>📡 Scanner Bot</b>",
		"",
		"Melhor oportunidade detectada no momento.",
		"",
		`<b>Melhor oportunidade</b>: ${escapeHtml(best.symbol)} - ${escapeHtml(best.team)}`,
		`<b>Comprar</b>: ${escapeHtml(best.best_arb.buy_exchange_label)}`,
		`<b>Vender</b>: ${escapeHtml(best.best_arb.sell_exchange_label)}`,
		`<b>Spread bruto</b>: ${best.best_arb.spread_pct.toFixed(3)}%`,
		`<b>Spread liquido</b>: ${best.best_arb.net_spread_pct.toFixed(3)}%`,
		`<b>Qualidade</b>: ${best.best_arb.quality}`,
		`<b>Lucro estimado</b>: ${formatBrl(best.best_arb.profit_est_brl_per_100)}/100 BRL`,
		"",
		"<b>Top 3 sinais</b>",
		...topThree.map((token, index) => {
			const arb = token.best_arb;
			if (!arb) {
				return `${index + 1}. ${escapeHtml(token.symbol)} - sem sinal`;
			}

			return `${index + 1}. ${escapeHtml(token.symbol)} - ${escapeHtml(token.team)} | ${escapeHtml(arb.buy_exchange_label)} -> ${escapeHtml(arb.sell_exchange_label)} | ${arb.spread_pct.toFixed(3)}% bruto | ${arb.net_spread_pct.toFixed(3)}% liquido`;
		}),
		`<b>Atualizado</b>: ${formatTimestamp(payload.timestamp)}`,
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