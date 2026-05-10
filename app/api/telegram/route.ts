import { NextRequest, NextResponse } from "next/server";
import {
	buildOnboardingMessage,
	buildPauseConfirmMessage,
	buildPauseMenuMarkup,
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
	sendBloqueioMessage,
	sendTelegramMessage,
} from "@/lib/telegram";
import { getTelegramUserSettings, setTelegramUserSettings } from "@/lib/telegram-user-settings";
import { temAcesso, isTrialAtivo, TRIAL_DAYS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidWebhookSecret(request: NextRequest): boolean {
	const expectedSecret = getTelegramWebhookSecret();
	if (!expectedSecret) return true;
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
		// First-time trial activation
		const settings = await getTelegramUserSettings(chatId);
		if (!settings.trialUsed && isTrialAtivo()) {
			const trialExpiresAt = Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
			await setTelegramUserSettings(chatId, {
				plan: "pro",
				planActive: true,
				planStartedAt: Date.now(),
				planExpiresAt: trialExpiresAt,
				trialUsed: true,
			});
			await sendTelegramMessage(chatId, "🎁 <b>Seu trial Pro de 7 dias foi ativado!</b>\nAproveite acesso completo a todas as trilhas.");
		}

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
		const settings = await setTelegramUserSettings(chatId, { autoSignalsMode: "usdt" });
		await sendTelegramMessage(
			chatId,
			await buildUsdtSignalMessage(baseUrl, { autoSignalsMode: settings.autoSignalsMode }),
			{ reply_markup: buildTelegramSignalMarkup("usdt") }
		);
		return;
	}

	if (action === "usdt_defi") {
		const settings = await getTelegramUserSettings(chatId);
		const planInfo = { plan: settings.plan, planActive: settings.planActive, planExpiresAt: settings.planExpiresAt, trialUsed: settings.trialUsed };
		if (!temAcesso(planInfo, "trilha_c")) {
			await sendBloqueioMessage(chatId, "trilha_c");
			return;
		}
		await setTelegramUserSettings(chatId, { autoSignalsMode: "usdt_defi" });
		await sendTelegramMessage(chatId, await buildUsdtDefiSignalMessage(baseUrl), {
			reply_markup: buildTelegramSignalMarkup("usdt_defi"),
		});
		return;
	}

	// scanner
	const settings = await getTelegramUserSettings(chatId);
	const planInfo = { plan: settings.plan, planActive: settings.planActive, planExpiresAt: settings.planExpiresAt, trialUsed: settings.trialUsed };
	if (!temAcesso(planInfo, "trilha_b")) {
		await sendBloqueioMessage(chatId, "trilha_b");
		return;
	}
	await setTelegramUserSettings(chatId, { autoSignalsMode: "scanner" });
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
	const effectiveChatId = chatId ?? callbackQuery?.message?.chat?.id ?? null;

	if (!effectiveChatId) return NextResponse.json({ ok: true });
	if (!isAllowedTelegramChat(effectiveChatId)) return NextResponse.json({ ok: true, ignored: true });

	// ack callback immediately
	if (callbackQuery?.id) {
		await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/answerCallbackQuery`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ callback_query_id: callbackQuery.id, show_alert: false }),
		});
	}

	try {
		// --- mode: actions (signal views) ---
		if (callbackData.startsWith("mode:")) {
			const modeAction = callbackData.slice("mode:".length) as "menu" | "usdt" | "usdt_defi" | "scanner";
			await handleAction(modeAction, request.nextUrl.origin, effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		// --- settings:open ---
		if (callbackData === "settings:open") {
			await sendSettings(effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		// --- settings:auto_* ---
		if (callbackData.startsWith("settings:auto_")) {
			const modeKey = callbackData.replace("settings:auto_", "");
			const mode =
				modeKey === "usdt" ? "usdt"
				: modeKey === "scanner" ? "scanner"
				: modeKey === "usdt_defi" ? "usdt_defi"
				: modeKey === "all" ? "all"
				: "off";
			const updated = await setTelegramUserSettings(effectiveChatId, { autoSignalsMode: mode });
			await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
				reply_markup: buildTelegramSettingsMarkup(updated),
			});
			return NextResponse.json({ ok: true });
		}

		// --- alerts:on / alerts:off ---
		if (callbackData === "alerts:on" || callbackData === "alerts:off") {
			const enabling = callbackData === "alerts:on";
			const current = await getTelegramUserSettings(effectiveChatId);
			const wasDisabled = !current.alertsEnabled;
			const updated = await setTelegramUserSettings(effectiveChatId, { alertsEnabled: enabling });

			if (enabling && wasDisabled) {
				await sendTelegramMessage(effectiveChatId, buildOnboardingMessage());
			}
			await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
				reply_markup: buildTelegramSettingsMarkup(updated),
			});
			return NextResponse.json({ ok: true });
		}

		// --- track:a_on/off, track:b_on/off, track:c_on/off ---
		if (callbackData.startsWith("track:")) {
			const parts = callbackData.slice("track:".length).split("_");
			const trackKey = parts[0] as "a" | "b" | "c";
			const on = parts[1] === "on";
			const current = await getTelegramUserSettings(effectiveChatId);
			const updatedTracks = { ...current.alertTracks, [trackKey]: on };
			const updated = await setTelegramUserSettings(effectiveChatId, {
				alertTracks: updatedTracks,
			});
			await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
				reply_markup: buildTelegramSettingsMarkup(updated),
			});
			return NextResponse.json({ ok: true });
		}

		// --- spread_a:<value> ---
		if (callbackData.startsWith("spread_a:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v > 0) {
				const updated = await setTelegramUserSettings(effectiveChatId, { minSpreadA: v });
				await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
					reply_markup: buildTelegramSettingsMarkup(updated),
				});
			}
			return NextResponse.json({ ok: true });
		}

		// --- spread_b:<value> ---
		if (callbackData.startsWith("spread_b:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v > 0) {
				const updated = await setTelegramUserSettings(effectiveChatId, { minSpreadB: v });
				await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
					reply_markup: buildTelegramSettingsMarkup(updated),
				});
			}
			return NextResponse.json({ ok: true });
		}

		// --- capital:<value> ---
		if (callbackData.startsWith("capital:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v > 0) {
				const updated = await setTelegramUserSettings(effectiveChatId, { simCapital: v });
				await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
					reply_markup: buildTelegramSettingsMarkup(updated),
				});
			}
			return NextResponse.json({ ok: true });
		}

		// --- silent:on / silent:off ---
		if (callbackData === "silent:on" || callbackData === "silent:off") {
			const updated = await setTelegramUserSettings(effectiveChatId, {
				silentNight: callbackData === "silent:on",
			});
			await sendTelegramMessage(effectiveChatId, buildTelegramSettingsMessage(updated), {
				reply_markup: buildTelegramSettingsMarkup(updated),
			});
			return NextResponse.json({ ok: true });
		}

		// --- pause:menu (show pause duration choices) ---
		if (callbackData === "pause:menu") {
			await sendTelegramMessage(
				effectiveChatId,
				"🔕 <b>Pausar alertas</b>\nPor quanto tempo?",
				{ reply_markup: buildPauseMenuMarkup() }
			);
			return NextResponse.json({ ok: true });
		}

		// --- pause:1h / pause:4h / pause:24h / pause:forever ---
		if (callbackData.startsWith("pause:") && callbackData !== "pause:menu") {
			const key = callbackData.split(":")[1];
			const now = Date.now();
			const pausedUntil =
				key === "1h" ? now + 60 * 60 * 1000
				: key === "4h" ? now + 4 * 60 * 60 * 1000
				: key === "24h" ? now + 24 * 60 * 60 * 1000
				: null; // forever
			await setTelegramUserSettings(effectiveChatId, { pausedUntil });
			await sendTelegramMessage(effectiveChatId, buildPauseConfirmMessage(pausedUntil));
			return NextResponse.json({ ok: true });
		}

		// --- plan:upgrade ---
		if (callbackData === "plan:upgrade") {
			await sendTelegramMessage(
				effectiveChatId,
				"Em breve! Entraremos em contato quando as assinaturas abrirem. 🚀"
			);
			return NextResponse.json({ ok: true });
		}

		// --- text commands ---
		if (action) {
			await handleAction(action, request.nextUrl.origin, effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Falha ao processar comando";
		return NextResponse.json({ error: message }, { status: 503 });
	}
}

export async function GET() {
	return NextResponse.json({
		ok: true,
		help: "Envie /start, /usdt, /usdt_defi, /scanner ou /configurar no chat do bot.",
	});
}