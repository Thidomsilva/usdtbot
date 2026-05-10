import { NextRequest, NextResponse } from "next/server";
import {
	buildScannerSignalMessage,
	buildTelegramHelpMessage,
	buildTelegramMenuMarkup,
	buildTelegramMenuMessage,
	buildTelegramSettingsMarkup,
	buildTelegramSettingsMessage,
	buildTelegramSignalMarkup,
	buildUsdtDefiSignalMessage,
	buildUsdtSignalMessage,
	extractTelegramUpdate,
	getTelegramBotToken,
	getTelegramWebhookSecret,
	isAllowedTelegramChat,
	sendTelegramMessage,
} from "@/lib/telegram";
import { getTelegramUserSettings, setTelegramUserSettings } from "@/lib/telegram-user-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidWebhookSecret(request: NextRequest): boolean {
	const expectedSecret = getTelegramWebhookSecret();
	if (!expectedSecret) {
		return true;
	}

	return request.headers.get("x-telegram-bot-api-secret-token") === expectedSecret;
}

async function sendSettings(chatId: number | string) {
	const settings = await getTelegramUserSettings(chatId);
	await sendTelegramMessage(chatId, buildTelegramSettingsMessage(settings), {
		reply_markup: buildTelegramSettingsMarkup(settings),
	});
}

async function handleAction(
	action: "menu" | "settings" | "help" | "usdt" | "usdt_defi" | "scanner",
	baseUrl: string,
	chatId: number | string
) {
	if (action === "menu") {
		await sendTelegramMessage(chatId, buildTelegramMenuMessage(), {
			reply_markup: buildTelegramMenuMarkup(),
		});
		return;
	}

	if (action === "settings") {
		await sendSettings(chatId);
		return;
	}

	if (action === "help") {
		await sendTelegramMessage(chatId, buildTelegramHelpMessage());
		return;
	}

	if (action === "usdt") {
		const settings = await setTelegramUserSettings(chatId, {
			autoSignalsMode: "usdt",
		});
		await sendTelegramMessage(
			chatId,
			await buildUsdtSignalMessage(baseUrl, {
				autoSignalsMode: settings.autoSignalsMode,
			}),
			{
				reply_markup: buildTelegramSignalMarkup("usdt"),
			}
		);
		return;
	}

	if (action === "usdt_defi") {
		await setTelegramUserSettings(chatId, {
			autoSignalsMode: "usdt_defi",
		});

		await sendTelegramMessage(chatId, await buildUsdtDefiSignalMessage(baseUrl), {
			reply_markup: buildTelegramSignalMarkup("usdt_defi"),
		});
		return;
	}

	await setTelegramUserSettings(chatId, {
		autoSignalsMode: "scanner",
	});

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
	const callbackData = callbackQuery?.data ?? "";
	const callbackAction = callbackData.startsWith("mode:")
		? (callbackData.slice("mode:".length) as "menu" | "usdt" | "usdt_defi" | "scanner")
		: null;
	const callbackSettingsAction = callbackData === "settings:open"
		? "open"
		: callbackData === "settings:auto_usdt"
				? "auto_usdt"
				: callbackData === "settings:auto_scanner"
					? "auto_scanner"
					: callbackData === "settings:auto_usdt_defi"
						? "auto_usdt_defi"
						: callbackData === "settings:auto_all"
							? "auto_all"
						: callbackData === "settings:auto_off"
							? "auto_off"
			: null;
	const effectiveAction = action ?? callbackAction;
	const effectiveChatId = chatId ?? callbackQuery?.message?.chat?.id ?? null;

	if (!effectiveChatId || (!effectiveAction && !callbackSettingsAction)) {
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

		if (effectiveChatId && callbackSettingsAction === "open") {
			await sendSettings(effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		if (effectiveChatId && callbackSettingsAction?.startsWith("auto_")) {
			const mode =
				callbackSettingsAction === "auto_usdt"
					? "usdt"
					: callbackSettingsAction === "auto_scanner"
						? "scanner"
						: callbackSettingsAction === "auto_usdt_defi"
							? "usdt_defi"
							: callbackSettingsAction === "auto_all"
								? "all"
							: "off";

			const updated = await setTelegramUserSettings(effectiveChatId, {
				autoSignalsMode: mode,
			});

			await sendTelegramMessage(
				effectiveChatId,
				buildTelegramSettingsMessage(updated),
				{ reply_markup: buildTelegramSettingsMarkup(updated) }
			);

			return NextResponse.json({ ok: true });
		}

		if (!effectiveAction) {
			return NextResponse.json({ ok: true });
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
		help: "Envie /start, /usdt, /usdt_defi ou /scanner no chat do bot.",
	});
}