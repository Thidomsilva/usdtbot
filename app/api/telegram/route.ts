import { NextRequest, NextResponse } from "next/server";
import {
	buildScannerSignalMessage,
	buildTelegramHelpMessage,
	buildTelegramMenuMarkup,
	buildTelegramMenuMessage,
	buildTelegramSignalMarkup,
	buildUsdtSignalMessage,
	extractTelegramUpdate,
	getTelegramBotToken,
	getTelegramWebhookSecret,
	isAllowedTelegramChat,
	sendTelegramMessage,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidWebhookSecret(request: NextRequest): boolean {
	const expectedSecret = getTelegramWebhookSecret();
	if (!expectedSecret) {
		return true;
	}

	return request.headers.get("x-telegram-bot-api-secret-token") === expectedSecret;
}

async function handleAction(action: "menu" | "help" | "usdt" | "scanner", baseUrl: string, chatId: number | string) {
	if (action === "menu") {
		await sendTelegramMessage(chatId, buildTelegramMenuMessage(), {
			reply_markup: buildTelegramMenuMarkup(),
		});
		return;
	}

	if (action === "help") {
		await sendTelegramMessage(chatId, buildTelegramHelpMessage());
		return;
	}

	if (action === "usdt") {
		await sendTelegramMessage(chatId, await buildUsdtSignalMessage(baseUrl), {
			reply_markup: buildTelegramSignalMarkup("usdt"),
		});
		return;
	}

	await sendTelegramMessage(chatId, await buildScannerSignalMessage(baseUrl), {
		reply_markup: buildTelegramSignalMarkup("scanner"),
	});
}

export async function POST(request: NextRequest) {
	if (!getTelegramBotToken()) {
		return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN nao configurado" }, { status: 503 });
	}

	if (!hasValidWebhookSecret(request)) {
		return NextResponse.json({ error: "Webhook secret invalido" }, { status: 401 });
	}

	const update = await request.json().catch(() => null);
	const { chatId, action } = extractTelegramUpdate(update ?? {});
	const callbackQuery = update?.callback_query as
		| { id?: string; data?: string; message?: { chat?: { id?: number | string } } }
		| undefined;
	const callbackAction = callbackQuery?.data?.startsWith("mode:")
		? (callbackQuery.data.slice("mode:".length) as "menu" | "usdt" | "scanner")
		: null;
	const effectiveAction = action ?? callbackAction;
	const effectiveChatId = chatId ?? callbackQuery?.message?.chat?.id ?? null;

	if (!effectiveChatId || !effectiveAction) {
		return NextResponse.json({ ok: true });
	}

	if (!isAllowedTelegramChat(effectiveChatId)) {
		return NextResponse.json({ ok: true, ignored: true });
	}

	try {
		if (callbackQuery?.id) {
			await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/answerCallbackQuery`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					callback_query_id: callbackQuery.id,
					text: "Processando sua escolha...",
					show_alert: false,
				}),
			});
		}

		await handleAction(effectiveAction, request.nextUrl.origin, effectiveChatId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Falha ao processar comando";
		return NextResponse.json({ error: message }, { status: 503 });
	}
}

export async function GET() {
	return NextResponse.json({
		ok: true,
		help: "Envie /start, /usdt ou /scanner no chat do bot.",
	});
}