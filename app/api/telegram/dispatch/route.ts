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
import { getUserByTelegramChatId, listUsers } from "@/lib/user-store";
import {
	checkAlertEligibility,
	getTelegramUserSettings,
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

function tracksByAutoMode(mode: "off" | "usdt" | "scanner" | "usdt_defi" | "all") {
	if (mode === "usdt") return { a: true, b: false, c: false };
	if (mode === "scanner") return { a: false, b: true, c: false };
	if (mode === "usdt_defi") return { a: false, b: false, c: true };
	if (mode === "all") return { a: true, b: true, c: true };
	return { a: false, b: false, c: false };
}

async function dispatchAlert(
	chatId: string,
	origin: string,
	track: "a" | "b" | "c"
): Promise<{ status: "sent" | "skipped" | "failed"; reason?: string }> {
	try {
		const settings = await getTelegramUserSettings(chatId);

		let scannerKey: string | undefined;
		let messageText: string | null = null;

		// Build message first (need scannerKey for eligibility check on B)
		if (track === "b") {
			const result = await buildAlertScannerMessage(origin, settings);
			if (!result) return { status: "skipped", reason: "track_b_no_spread_or_data" };
			scannerKey = result.key;
			// spread threshold already checked inside buildAlertScannerMessage via settings.minSpreadB
			// but we still need to check eligibility (cooldown/limits)
			const check = checkAlertEligibility(settings, "b", scannerKey);
			if (!check.allowed) return { status: "skipped", reason: `track_b_${check.reason}` };
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
			if (!check.allowed) return { status: "skipped", reason: `track_a_${check.reason}` };
			const planInfo = {
				plan: settings.plan,
				planActive: settings.planActive,
				planExpiresAt: settings.planExpiresAt,
				trialUsed: settings.trialUsed,
			};
			const effectiveMinSpreadA = spreadMinimoEfetivo(planInfo, settings.minSpreadA);

			messageText = await buildAlertUsdtMessage(origin, settings, effectiveMinSpreadA);
			if (!messageText) return { status: "skipped", reason: "track_a_no_spread_or_data" };

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
			if (!check.allowed) return { status: "skipped", reason: `track_c_${check.reason}` };

			messageText = await buildAlertUsdtDefiMessage(origin, settings);
			if (!messageText) return { status: "skipped", reason: "track_c_no_spread_or_data" }; // returns null when spread <= 0

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

		if (!messageText) return { status: "skipped", reason: "message_empty" };

		const signalType = track === "a" ? "usdt" : track === "c" ? "usdt_defi" : "scanner";
		await sendTelegramMessage(chatId, messageText, {
			reply_markup: buildTelegramSignalMarkup(signalType),
		});

		return { status: "sent" };
	} catch (err) {
		console.error(`[DISPATCH] track=${track} chatId=${chatId} error:`, err);
		return { status: "failed", reason: `track_${track}_exception` };
	}
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
	}

	const settingsEntries = await listTelegramUserSettings();
	const users = await listUsers();
	const origin = request.nextUrl.origin;

	const settingsByChatId = new Map(
		settingsEntries.map((entry) => [entry.chatId, entry.settings] as const)
	);

	const dispatchChatIds = new Set<string>();
	for (const user of users) {
		if (!user.active) continue;
		if (!user.telegramChatId) continue;
		dispatchChatIds.add(user.telegramChatId);
	}

	// Mantem compatibilidade com settings antigos que ainda nao possuem usuario vinculado
	// (serao descartados no check de vinculo abaixo).
	for (const entry of settingsEntries) {
		dispatchChatIds.add(entry.chatId);
	}

	let sent = 0;
	let skipped = 0;
	let failed = 0;
	let allowlistMismatches = 0;
	let skippedUnlinkedUser = 0;
	let skippedMonitoringDisabled = 0;
	let skippedNoTrackEnabled = 0;
	const skippedByReason: Record<string, number> = {};

	for (const chatId of dispatchChatIds) {
		const settings = settingsByChatId.get(chatId) ?? (await getTelegramUserSettings(chatId));

		const linkedUser = await getUserByTelegramChatId(chatId);
		if (!linkedUser) {
			skipped++;
			skippedUnlinkedUser++;
			continue;
		}

		// Do not block automatic dispatch for authenticated and linked users.
		// Allowlist remains enforced in webhook handling, but dispatch should not silently drop legit users.
		if (!isAllowedTelegramChat(chatId)) {
			allowlistMismatches++;
		}

		let effectiveSettings = settings;

		if (!settings.alertsEnabled && settings.autoSignalsMode !== "off") {
			const syncedTracks = tracksByAutoMode(settings.autoSignalsMode);
			effectiveSettings = await setTelegramUserSettings(chatId, {
				alertsEnabled: true,
				alertTracks: syncedTracks,
				pausedUntil: null,
			});
		}

		if (!effectiveSettings.alertsEnabled) {
			skipped++;
			skippedMonitoringDisabled++;
			continue;
		}

		const tracks: Array<"a" | "b" | "c"> = [];
		if (effectiveSettings.alertTracks.a) tracks.push("a");
		if (effectiveSettings.alertTracks.b) tracks.push("b");
		if (effectiveSettings.alertTracks.c) tracks.push("c");

		if (tracks.length === 0) {
			skipped++;
			skippedNoTrackEnabled++;
			continue;
		}

		for (const track of tracks) {
			const result = await dispatchAlert(chatId, origin, track);
			if (result.status === "sent") {
				sent++;
				continue;
			}

			if (result.status === "failed") {
				failed++;
			} else {
				skipped++;
			}

			if (result.reason) {
				skippedByReason[result.reason] = (skippedByReason[result.reason] ?? 0) + 1;
			}
		}
	}

	return NextResponse.json({
		ok: true,
		total_users: users.length,
		total_settings: settingsEntries.length,
		total_dispatch_chats: dispatchChatIds.size,
		sent,
		skipped,
		failed,
		diagnostics: {
			allowlist_mismatches: allowlistMismatches,
			skipped_unlinked_user: skippedUnlinkedUser,
			skipped_monitoring_disabled: skippedMonitoringDisabled,
			skipped_no_track_enabled: skippedNoTrackEnabled,
			skipped_by_reason: skippedByReason,
		},
	});
}
