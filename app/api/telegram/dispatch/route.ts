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
	PAUSE_FOREVER,
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
			// Garante que alertsEnabled nunca volte para false após auto-heal manual
			nextSettings = await setTelegramUserSettings(chatId, { ...check.updates, alertsEnabled: true });
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

			nextSettings = await setTelegramUserSettings(chatId, { ...check.updates, alertsEnabled: true });
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

			nextSettings = await setTelegramUserSettings(chatId, { ...check.updates, alertsEnabled: true });
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

async function markTracksSkippedBeforeDispatch(
	chatId: string,
	settings: Awaited<ReturnType<typeof getTelegramUserSettings>>,
	reason: string
): Promise<Awaited<ReturnType<typeof getTelegramUserSettings>>> {
	let nextSettings = settings;
	const tracks: Array<"a" | "b" | "c"> = [];
	if (settings.alertTracks.a) tracks.push("a");
	if (settings.alertTracks.b) tracks.push("b");
	if (settings.alertTracks.c) tracks.push("c");

	for (const track of tracks) {
		nextSettings = await setTelegramUserSettings(chatId, {
			...nextSettings,
			...buildDispatchTrackPatch(track, "skipped", reason),
		});
	}

	return nextSettings;
}

export async function GET(request: NextRequest) {
	if (!isAuthorized(request)) {
		return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
	}

	try {
		const users = await listUsers();
		const origin = request.nextUrl.origin;
		const sourceParam = request.nextUrl.searchParams.get("source");
		const source: "cron" | "manual" = sourceParam === "manual" ? "manual" : "cron";
		const targetChatId = request.nextUrl.searchParams.get("chat_id")?.trim() ?? "";

		const dispatchChatIds = new Set<string>();
		if (targetChatId) {
			dispatchChatIds.add(targetChatId);
		} else {
			for (const user of users) {
				if (!user.active) continue;
				if (!user.telegramChatId) continue;
				dispatchChatIds.add(user.telegramChatId);
			}
		}

		let sent = 0;
		let skipped = 0;
		let failed = 0;
		let processedChats = 0;
		let allowlistMismatches = 0;
		let skippedUnlinkedUser = 0;
		let skippedMonitoringDisabled = 0;
		let skippedNoTrackEnabled = 0;
		let autoEnabledMissingSettings = 0;
		const skippedByReason: Record<string, number> = {};

		for (const chatId of dispatchChatIds) {
			try {
				processedChats++;
				let settings = await getTelegramUserSettings(chatId);
				const linkedUser = await getUserByTelegramChatId(chatId);

				if (source === "cron") {
					settings = await setTelegramUserSettings(chatId, { lastCronAt: Date.now() });
				}

				// Auto-heal stale auth flags: if chat is linked and active, dispatch should not stay blocked forever.
				if (linkedUser && settings.suppressDispatchUntilAuth) {
					settings = await setTelegramUserSettings(chatId, { suppressDispatchUntilAuth: false });
				}

				if (linkedUser && settings.pendingAuthStep) {
					settings = await setTelegramUserSettings(chatId, {
						pendingAuthStep: null,
						pendingAuthUsername: null,
					});
				}

				if (settings.suppressDispatchUntilAuth) {
					settings = await markTracksSkippedBeforeDispatch(chatId, settings, "logged_out_waiting_auth");
					skipped++;
					skippedByReason["logged_out_waiting_auth"] = (skippedByReason["logged_out_waiting_auth"] ?? 0) + 1;
					continue;
				}
				if (settings.pendingAuthStep) {
					settings = await markTracksSkippedBeforeDispatch(chatId, settings, `auth_in_progress_${settings.pendingAuthStep}`);
					skipped++;
					skippedByReason[`auth_in_progress_${settings.pendingAuthStep}`] =
						(skippedByReason[`auth_in_progress_${settings.pendingAuthStep}`] ?? 0) + 1;
					continue;
				}

				if (!linkedUser) {
					settings = await markTracksSkippedBeforeDispatch(chatId, settings, "unlinked_user");
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

				// Auditoria: loga quando alertsEnabled está false
				if (!effectiveSettings.alertsEnabled) {
					// Auto-heal defensivo: se for dispatch manual, reativa monitoramento
					if (source === "manual") {
						// Limpa status das trilhas para 'aguardando primeira verificacao'
						const patch: Partial<typeof effectiveSettings> = {
							alertsEnabled: true,
							pausedUntil: null,
							lastDispatchAtA: null,
							lastDispatchStatusA: null,
							lastDispatchReasonA: null,
							lastDispatchAtB: null,
							lastDispatchStatusB: null,
							lastDispatchReasonB: null,
							lastDispatchAtC: null,
							lastDispatchStatusC: null,
							lastDispatchReasonC: null,
						};
						await setTelegramUserSettings(chatId, patch);
						effectiveSettings = { ...effectiveSettings, ...patch };
						console.log(`[AUDITORIA] Auto-heal: reativado alertsEnabled e limpou status trilhas para chatId=${chatId} via dispatch manual.`);
					} else {
						effectiveSettings = await markTracksSkippedBeforeDispatch(chatId, effectiveSettings, "monitoring_disabled");
						skipped++;
						skippedMonitoringDisabled++;
						continue;
					}
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
			} catch (error) {
				failed++;
				const message = error instanceof Error ? error.message : String(error ?? "unknown error");
				const compact = message.replace(/\s+/g, " ").slice(0, 180);
				skippedByReason[`dispatch_loop_exception:${compact}`] =
					(skippedByReason[`dispatch_loop_exception:${compact}`] ?? 0) + 1;
				console.error(`[DISPATCH] chat loop error chatId=${chatId}:`, error);
			}
		}

		return NextResponse.json({
			ok: true,
			total_users: users.length,
			total_settings: dispatchChatIds.size,
			total_dispatch_chats: dispatchChatIds.size,
			processed_chats: processedChats,
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
	} catch (error) {
		console.error("[DISPATCH] fatal error:", error);
		const message = error instanceof Error ? error.message : "Falha inesperada no dispatcher";
		return NextResponse.json({ error: message }, { status: 503 });
	}
}
