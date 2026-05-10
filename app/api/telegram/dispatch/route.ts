import { NextRequest, NextResponse } from "next/server";
import {
	buildAlertScannerMessage,
	buildAlertUsdtDefiMessage,
	buildAlertUsdtMessage,
	buildPauseConfirmMessage,
	buildTelegramSignalMarkup,
	isAllowedTelegramChat,
	sendTelegramMessage,
} from "@/lib/telegram";
import {
	checkAlertEligibility,
	listTelegramUserSettings,
	PAUSE_SPAM_MS,
	setTelegramUserSettings,
} from "@/lib/telegram-user-settings";
import { spreadMinimoEfetivo } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.CRON_SECRET?.trim();
	if (!secret) return true;
	return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function dispatchAlert(
	chatId: string,
	origin: string,
	track: "a" | "b" | "c"
): Promise<"sent" | "skipped" | "failed"> {
	try {
		const { getTelegramUserSettings } = await import("@/lib/telegram-user-settings");
		const settings = await getTelegramUserSettings(chatId);

		let scannerKey: string | undefined;
		let messageText: string | null = null;

		// Build message first (need scannerKey for eligibility check on B)
		if (track === "b") {
			const result = await buildAlertScannerMessage(origin, settings);
			if (!result) return "skipped";
			scannerKey = result.key;
			// spread threshold already checked inside buildAlertScannerMessage via settings.minSpreadB
			// but we still need to check eligibility (cooldown/limits)
			const check = checkAlertEligibility(settings, "b", scannerKey);
			if (!check.allowed) return "skipped";
			messageText = result.message;
			await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		} else if (track === "a") {
			const check = checkAlertEligibility(settings, "a");
			if (!check.allowed) return "skipped";

			// Check spread threshold
			messageText = await buildAlertUsdtMessage(origin, settings);
			if (!messageText) return "skipped";

			const planInfo = { plan: settings.plan, planActive: settings.planActive, planExpiresAt: settings.planExpiresAt, trialUsed: settings.trialUsed };
			const spreadOk = await checkUsdtSpread(origin, settings.minSpreadA, planInfo);
			if (!spreadOk) return "skipped";

			await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		} else {
			// track C
			const check = checkAlertEligibility(settings, "c");
			if (!check.allowed) return "skipped";

			messageText = await buildAlertUsdtDefiMessage(origin, settings);
			if (!messageText) return "skipped"; // returns null when spread <= 0

			await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		}

		if (!messageText) return "skipped";

		const signalType = track === "a" ? "usdt" : track === "c" ? "usdt_defi" : "scanner";
		await sendTelegramMessage(chatId, messageText, {
			reply_markup: buildTelegramSignalMarkup(signalType),
		});

		return "sent";
	} catch (err) {
		console.error(`[DISPATCH] track=${track} chatId=${chatId} error:`, err);
		return "failed";
	}
}

async function checkUsdtSpread(
	origin: string,
	minSpreadPct: number,
	planInfo: { plan: import("@/lib/plans").UserPlan; planActive: boolean; planExpiresAt: number | null; trialUsed: boolean }
): Promise<boolean> {
	try {
		const effectiveMin = spreadMinimoEfetivo(planInfo, minSpreadPct);
		const res = await fetch(new URL("/api/prices", origin), {
			method: "GET",
			cache: "no-store",
			headers: { accept: "application/json", "user-agent": "usdtbot-dispatch/1.0" },
		});
		if (!res.ok) return false;
		const prices = await res.json() as { exchanges: Record<string, { status: string; price_brl?: number }> };
		const valid = Object.values(prices.exchanges)
			.filter((e) => e.status === "ok" && typeof e.price_brl === "number" && e.price_brl > 0)
			.map((e) => e.price_brl as number);
		if (valid.length < 2) return false;
		const buyPrice = Math.min(...valid);
		const sellPrice = Math.max(...valid);
		const spread = ((sellPrice - buyPrice) / buyPrice) * 100;
		return spread >= effectiveMin;
	} catch {
		return false;
	}
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
	}

	const users = await listTelegramUserSettings();
	const origin = request.nextUrl.origin;

	let sent = 0;
	let skipped = 0;
	let failed = 0;

	for (const user of users) {
		const { chatId, settings } = user;

		if (!isAllowedTelegramChat(chatId)) {
			skipped++;
			continue;
		}

		if (!settings.alertsEnabled) {
			skipped++;
			continue;
		}

		const tracks: Array<"a" | "b" | "c"> = [];
		if (settings.alertTracks.a) tracks.push("a");
		if (settings.alertTracks.b) tracks.push("b");
		if (settings.alertTracks.c) tracks.push("c");

		for (const track of tracks) {
			const result = await dispatchAlert(chatId, origin, track);
			if (result === "sent") sent++;
			else if (result === "failed") failed++;
			else skipped++;
		}
	}

	return NextResponse.json({
		ok: true,
		total_users: users.length,
		sent,
		skipped,
		failed,
	});
}
