import { NextRequest, NextResponse } from "next/server";
import {
	buildAlertScannerMessage,
	buildAlertUsdtDefiMessage,
	buildAlertUsdtMessage,
	buildPauseConfirmMessage,
	isAllowedTelegramChat,
	sendTelegramMessage,
} from "@/lib/telegram";
import { getUserByTelegramChatId, listUsers } from "@/lib/user-store";
import {
	checkAlertEligibility,
	type DispatchTrackStatus,
	getTelegramUserSettings,
	PAUSE_SPAM_MS,
	setTelegramUserSettings,
} from "@/lib/telegram-user-settings";
import { spreadMinimoEfetivo } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.CRON_SECRET?.trim();
	if (!secret) return true;

	const authHeader = request.headers.get("authorization");
	if (authHeader === `Bearer ${secret}`) return true;

	// Fallback para cron nativo da Vercel quando Authorization nao estiver presente.
	if (request.headers.get("x-vercel-cron") === "1") return true;

	return false;
}

function tracksByAutoMode(mode: "off" | "usdt" | "scanner" | "usdt_defi" | "all") {
	if (mode === "usdt") return { a: true, b: false, c: false };
	if (mode === "scanner") return { a: false, b: true, c: false };
	if (mode === "usdt_defi") return { a: false, b: false, c: true };
	if (mode === "all") return { a: true, b: true, c: true };
	return { a: false, b: false, c: false };
}

function hasHistoricalMonitoringEvidence(
	settings: Awaited<ReturnType<typeof getTelegramUserSettings>>
): boolean {
	return Boolean(
		settings.lastCronAt !== null ||
		settings.lastDispatchAtA !== null ||
		settings.lastDispatchAtB !== null ||
		settings.lastDispatchAtC !== null ||
		settings.alertsThisHour > 0 ||
		settings.alertsToday > 0
	);
}

function isLikelyFreshDefaultSettings(
	settings: Awaited<ReturnType<typeof getTelegramUserSettings>>
): boolean {
	return (
		settings.autoSignalsMode === "off" &&
		settings.alertsEnabled === false &&
		settings.alertTracks.a &&
		settings.alertTracks.b &&
		settings.alertTracks.c &&
		settings.minSpreadA === 0.5 &&
		settings.minSpreadB === 2 &&
		settings.minSpreadC === 0.1 &&
		settings.simCapital === 1000 &&
		settings.silentNight === false &&
		settings.pausedUntil === null &&
		!hasHistoricalMonitoringEvidence(settings)
	);
}

function buildDispatchTrackPatch(
	track: "a" | "b" | "c",
	status: DispatchTrackStatus,
	reason?: string
) {
	const now = Date.now();
	const normalizedReason = reason ?? null;

	if (track === "a") {
		return {
			lastDispatchAtA: now,
			lastDispatchStatusA: status,
			lastDispatchReasonA: normalizedReason,
		};
	}

	if (track === "b") {
		return {
			lastDispatchAtB: now,
			lastDispatchStatusB: status,
			lastDispatchReasonB: normalizedReason,
		};
	}

	return {
		lastDispatchAtC: now,
		lastDispatchStatusC: status,
		lastDispatchReasonC: normalizedReason,
	};
}

async function dispatchAlert(
	chatId: string,
	origin: string,
	settings: Awaited<ReturnType<typeof getTelegramUserSettings>>,
	track: "a" | "b" | "c"
): Promise<{
	status: "sent" | "skipped" | "failed";
	reason?: string;
	settings: Awaited<ReturnType<typeof getTelegramUserSettings>>;
}> {
	try {
		let scannerKey: string | undefined;
		let messageText: string | null = null;
		let nextSettings = settings;

		// Build message first (need scannerKey for eligibility check on B)
		if (track === "b") {
			const result = await buildAlertScannerMessage(origin, nextSettings);
			if (!result) return { status: "skipped", reason: "track_b_no_spread_or_data", settings: nextSettings };
			scannerKey = result.key;
			// spread threshold already checked inside buildAlertScannerMessage via settings.minSpreadB
			// but we still need to check eligibility (cooldown/limits)
			const check = checkAlertEligibility(nextSettings, "b", scannerKey);
			if (!check.allowed) return { status: "skipped", reason: `track_b_${check.reason}`, settings: nextSettings };
			messageText = result.message;
			nextSettings = await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				nextSettings = await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		} else if (track === "a") {
			const check = checkAlertEligibility(nextSettings, "a");
			if (!check.allowed) return { status: "skipped", reason: `track_a_${check.reason}`, settings: nextSettings };
			const planInfo = {
				plan: nextSettings.plan,
				planActive: nextSettings.planActive,
				planExpiresAt: nextSettings.planExpiresAt,
				trialUsed: nextSettings.trialUsed,
			};
			const effectiveMinSpreadA = spreadMinimoEfetivo(planInfo, nextSettings.minSpreadA);

			messageText = await buildAlertUsdtMessage(origin, nextSettings, effectiveMinSpreadA);
			if (!messageText) return { status: "skipped", reason: "track_a_no_spread_or_data", settings: nextSettings };

			nextSettings = await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				nextSettings = await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		} else {
			// track C
			const check = checkAlertEligibility(nextSettings, "c");
			if (!check.allowed) return { status: "skipped", reason: `track_c_${check.reason}`, settings: nextSettings };

			messageText = await buildAlertUsdtDefiMessage(origin, nextSettings);
			if (!messageText) return { status: "skipped", reason: "track_c_no_spread_or_data", settings: nextSettings }; // returns null when spread <= 0

			nextSettings = await setTelegramUserSettings(chatId, check.updates);
			if (check.autoSpamPause) {
				const pausedUntil = Date.now() + PAUSE_SPAM_MS;
				nextSettings = await setTelegramUserSettings(chatId, { pausedUntil });
				await sendTelegramMessage(
					chatId,
					`⚠️ Limite de alertas atingido. Pausando por 30 min.\n${buildPauseConfirmMessage(pausedUntil)}`
				);
			}
		}

		if (!messageText) return { status: "skipped", reason: "message_empty", settings: nextSettings };
		await sendTelegramMessage(chatId, messageText);

		return { status: "sent", settings: nextSettings };
	} catch (err) {
		const rawErrorMessage = err instanceof Error ? err.message : String(err ?? "unknown error");
		const errorMessage = rawErrorMessage.trim() || "unknown error";
		const compactError = errorMessage.replace(/\s+/g, " ").slice(0, 180);
		console.error(`[DISPATCH] track=${track} chatId=${chatId} error:`, err);
		return { status: "failed", reason: `track_${track}_exception:${compactError}`, settings };
	}
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
	}

	const healMode = request.nextUrl.searchParams.get("heal") === "1";

	const users = await listUsers();
	const origin = request.nextUrl.origin;

	const dispatchChatIds = new Set<string>();
	for (const user of users) {
		if (!user.active) continue;
		if (!user.telegramChatId) continue;
		dispatchChatIds.add(user.telegramChatId);
	}

	let sent = 0;
	let skipped = 0;
	let failed = 0;
	let allowlistMismatches = 0;
	let skippedUnlinkedUser = 0;
	let skippedMonitoringDisabled = 0;
	let skippedNoTrackEnabled = 0;
	let autoEnabledMissingSettings = 0;
	const skippedByReason: Record<string, number> = {};

	for (const chatId of dispatchChatIds) {
		const settings = await getTelegramUserSettings(chatId);

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

		if (!effectiveSettings.alertsEnabled) {
			const shouldRecoverByMode = effectiveSettings.autoSignalsMode !== "off";
			const shouldRecoverByHistory = hasHistoricalMonitoringEvidence(effectiveSettings);
			const shouldRecoverFreshDefault = isLikelyFreshDefaultSettings(effectiveSettings);
			const shouldRecoverInconsistentDisabled =
				effectiveSettings.pausedUntil === null &&
				(effectiveSettings.alertTracks.a ||
					effectiveSettings.alertTracks.b ||
					effectiveSettings.alertTracks.c);
			const shouldRecoverByHeal =
				healMode &&
				effectiveSettings.autoSignalsMode === "off" &&
				!shouldRecoverByHistory;
			if (
				shouldRecoverByMode ||
				shouldRecoverByHistory ||
				shouldRecoverFreshDefault ||
				shouldRecoverInconsistentDisabled ||
				shouldRecoverByHeal
			) {
				const syncedTracks = shouldRecoverByMode
					? tracksByAutoMode(effectiveSettings.autoSignalsMode)
					: shouldRecoverFreshDefault || shouldRecoverInconsistentDisabled || shouldRecoverByHeal
						? tracksByAutoMode("all")
						: effectiveSettings.alertTracks;
				effectiveSettings = await setTelegramUserSettings(chatId, {
					alertsEnabled: true,
					autoSignalsMode:
						(shouldRecoverFreshDefault || shouldRecoverInconsistentDisabled || shouldRecoverByHeal) &&
						effectiveSettings.autoSignalsMode === "off"
							? "all"
							: effectiveSettings.autoSignalsMode,
					alertTracks: syncedTracks,
					pausedUntil: null,
				});
				autoEnabledMissingSettings++;
			}
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
			// Sempre registra que o cron passou por este usuario nesta rodada.
			if (effectiveSettings.lastCronAt === null || Date.now() - effectiveSettings.lastCronAt > 30_000) {
				effectiveSettings = await setTelegramUserSettings(chatId, { lastCronAt: Date.now() });
			}
			const result = await dispatchAlert(chatId, origin, effectiveSettings, track);
			effectiveSettings = await setTelegramUserSettings(chatId, {
				...result.settings,
				...buildDispatchTrackPatch(track, result.status, result.reason),
			});
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
		total_settings: dispatchChatIds.size,
		total_dispatch_chats: dispatchChatIds.size,
		sent,
		skipped,
		failed,
		diagnostics: {
			allowlist_mismatches: allowlistMismatches,
			skipped_unlinked_user: skippedUnlinkedUser,
			skipped_monitoring_disabled: skippedMonitoringDisabled,
			skipped_no_track_enabled: skippedNoTrackEnabled,
			auto_enabled_missing_settings: autoEnabledMissingSettings,
			skipped_by_reason: skippedByReason,
		},
	});
}
