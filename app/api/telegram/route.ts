import { NextRequest, NextResponse } from "next/server";
import {
	buildTelegramAuthRequiredMessage,
	buildPauseConfirmMessage,
	buildPauseMenuMarkup,
	buildMonitoringStatusMarkup,
	buildMonitoringStatusMessage,
	buildScannerSignalMessage,
	buildTelegramHelpMessage,
	buildTelegramMenuMarkup,
	buildTelegramMenuMessage,
	parseTelegramCredentialsCommand,
	buildTelegramSettingsMarkup,
	buildTelegramSettingsMessage,
	buildTelegramSignalMarkup,
	buildUsdtDefiSignalMessage,
	buildUsdtSignalMessage,
	clearTelegramMessageReplyMarkup,
	deleteTelegramMessage,
	extractTelegramUpdate,
	getTelegramBotToken,
	getTelegramWebhookSecret,
	isAllowedTelegramChat,
	sendBloqueioMessage,
	sendTelegramMessage,
} from "@/lib/telegram";
import { getUserByTelegramChatId, linkTelegramChatToUser, registerTelegramUser, unlinkTelegramChat } from "@/lib/user-store";
import { PAUSE_FOREVER, getTelegramUserSettings, setTelegramUserSettings, type TelegramUserSettings } from "@/lib/telegram-user-settings";
import { temAcesso, isTrialAtivo, TRIAL_DAYS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENU_RETURN_DELAY_MS = 3000;
const MIN_SPREAD_ALLOWED = 0.1;
const MAX_SPREAD_ALLOWED = 10;

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

async function sendAuthRequired(chatId: number | string): Promise<void> {
	await sendTelegramMessage(chatId, buildTelegramAuthRequiredMessage());
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function formatTrackList(settings: TelegramUserSettings): string {
	const tracks: string[] = [];
	if (settings.alertTracks.a) tracks.push("A");
	if (settings.alertTracks.b) tracks.push("B");
	if (settings.alertTracks.c) tracks.push("C");
	return tracks.length > 0 ? tracks.join(" · ") : "nenhuma";
}

function buildCleanSettingsConfirmation(
	settings: TelegramUserSettings,
	extraLines: string[] = []
): string {
	const silence = settings.silentNight
		? `${settings.silentStart} as ${settings.silentEnd}`
		: "desativado";

	return [
		"✅ Configuracoes salvas!",
		...extraLines,
		`📊 Spread minimo: A ${settings.minSpreadA.toFixed(2)}% · B ${settings.minSpreadB.toFixed(2)}% · C ${settings.minSpreadC.toFixed(2)}%`,
		`💰 Valor simulado: R$ ${settings.simCapital.toLocaleString("pt-BR")}`,
		`🔕 Silencio: ${silence}`,
		`📡 Trilhas ativas: ${formatTrackList(settings)}`,
	].join("\n");
}

function parseSpreadInput(text: string): number | null {
	const normalized = text.trim().replace(",", ".");
	const value = Number(normalized);
	if (!Number.isFinite(value)) return null;
	return value;
}

function spreadFieldByTrack(track: "a" | "b" | "c"): "minSpreadA" | "minSpreadB" | "minSpreadC" {
	if (track === "a") return "minSpreadA";
	if (track === "b") return "minSpreadB";
	return "minSpreadC";
}

function spreadLabelByTrack(track: "a" | "b" | "c"): string {
	if (track === "a") return "A) CEX→CEX";
	if (track === "b") return "B) Scanner";
	return "C) CEX→DeFi";
}

async function clearPreviousButtons(chatId: number | string, messageId: number | null): Promise<void> {
	if (messageId === null) return;

	try {
		await clearTelegramMessageReplyMarkup(chatId, messageId);
	} catch {
		try {
			await deleteTelegramMessage(chatId, messageId);
		} catch {
			// ignore cleanup errors to avoid blocking user flow
		}
	}
}

async function sendMainMenu(chatId: number | string): Promise<void> {
	await sendTelegramMessage(chatId, buildTelegramMenuMessage(), {
		reply_markup: buildTelegramMenuMarkup(),
	});
}

async function sendMonitoringStatus(chatId: number | string, settings?: TelegramUserSettings): Promise<void> {
	const current = settings ?? await getTelegramUserSettings(chatId);
	await sendTelegramMessage(chatId, buildMonitoringStatusMessage(current), {
		reply_markup: buildMonitoringStatusMarkup(current),
	});
}

async function confirmAndShowStatus(
	chatId: number | string,
	message: string,
	settings?: TelegramUserSettings
): Promise<void> {
	await sendTelegramMessage(chatId, message);
	await sendMonitoringStatus(chatId, settings);
}

async function confirmAndBackToMenu(chatId: number | string, message: string): Promise<void> {
	await sendTelegramMessage(chatId, message);
	await sleep(MENU_RETURN_DELAY_MS);
	await sendMainMenu(chatId);
}

async function handleAction(
	action: "menu" | "settings" | "help" | "usdt" | "usdt_defi" | "scanner" | "status",
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

	if (action === "status") {
		const settings = await getTelegramUserSettings(chatId);
		await sendMonitoringStatus(chatId, settings);
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
		| { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number | string } } }
		| undefined;
	const callbackData = callbackQuery?.data ?? "";
	const callbackMessageId =
		typeof callbackQuery?.message?.message_id === "number" ? callbackQuery.message.message_id : null;
	const effectiveChatId = chatId ?? callbackQuery?.message?.chat?.id ?? null;
	const messageText =
		typeof update?.message?.text === "string" ? update.message.text.trim() : "";
	const credentialsCommand = parseTelegramCredentialsCommand(messageText);

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
		const linkedUser = await getUserByTelegramChatId(effectiveChatId);

		if (credentialsCommand) {
			if (!credentialsCommand.username || !credentialsCommand.password) {
				await sendTelegramMessage(
					effectiveChatId,
					credentialsCommand.command === "login"
						? "Use /login seu_usuario sua_senha"
						: "Use /cadastro seu_usuario sua_senha"
				);
				return NextResponse.json({ ok: true });
			}

			if (credentialsCommand.command === "cadastro") {
				try {
					const user = await registerTelegramUser({
						username: credentialsCommand.username,
						password: credentialsCommand.password,
						chatId: effectiveChatId,
					});
					await sendTelegramMessage(
						effectiveChatId,
						`✅ Cadastro concluido para <b>${user.username}</b>.\nEste chat foi autenticado com sucesso.`
					);
					await handleAction("menu", request.nextUrl.origin, effectiveChatId);
					return NextResponse.json({ ok: true });
				} catch (error) {
					const message = error instanceof Error ? error.message : "Falha ao cadastrar usuario";
					await sendTelegramMessage(effectiveChatId, `⚠️ ${message}`);
					return NextResponse.json({ ok: true });
				}
			}

			const user = await linkTelegramChatToUser({
				username: credentialsCommand.username,
				password: credentialsCommand.password,
				chatId: effectiveChatId,
			});
			if (!user) {
				await sendTelegramMessage(effectiveChatId, "⚠️ Usuario/senha invalidos ou acesso desativado.");
				return NextResponse.json({ ok: true });
			}

			await sendTelegramMessage(
				effectiveChatId,
				`✅ Chat autenticado com sucesso para <b>${user.username}</b>.`
			);
			await handleAction("menu", request.nextUrl.origin, effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		if (messageText.toLowerCase() === "/logout") {
			await unlinkTelegramChat(effectiveChatId);
			await sendTelegramMessage(effectiveChatId, "✅ Este chat foi desconectado. Para voltar a usar, envie /login ou /cadastro.");
			return NextResponse.json({ ok: true });
		}

		if (!linkedUser) {
			if (callbackQuery) {
				await sendAuthRequired(effectiveChatId);
				return NextResponse.json({ ok: true, unauthorized: true });
			}

			if (messageText && (action === "menu" || action === "help" || action === null)) {
				await sendAuthRequired(effectiveChatId);
				return NextResponse.json({ ok: true, unauthorized: true });
			}

			if (action) {
				await sendAuthRequired(effectiveChatId);
				return NextResponse.json({ ok: true, unauthorized: true });
			}
		}

		if (callbackQuery) {
			await clearPreviousButtons(effectiveChatId, callbackMessageId);
		}

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

		// --- settings:spread_adjust ---
		if (callbackData === "settings:spread_adjust") {
			await sendTelegramMessage(
				effectiveChatId,
				"Qual trilha deseja ajustar?",
				{
					reply_markup: {
						inline_keyboard: [
							[
								{ text: "A) CEX→CEX", callback_data: "spread_pick:a" },
								{ text: "B) Scanner", callback_data: "spread_pick:b" },
								{ text: "C) CEX→DeFi", callback_data: "spread_pick:c" },
							],
						],
					},
				}
			);
			return NextResponse.json({ ok: true });
		}

		// --- spread_pick:a|b|c ---
		if (callbackData.startsWith("spread_pick:")) {
			const track = callbackData.split(":")[1] as "a" | "b" | "c";
			if (track !== "a" && track !== "b" && track !== "c") {
				return NextResponse.json({ ok: true });
			}

			const current = await setTelegramUserSettings(effectiveChatId, {
				pendingSpreadTrack: track,
			});
			const spreadField = spreadFieldByTrack(track);
			const currentValue = current[spreadField];

			await sendTelegramMessage(
				effectiveChatId,
				[
					`Digite o spread minimo para alertas da trilha ${spreadLabelByTrack(track)}`,
					`Atual: ${currentValue.toFixed(2)}%`,
					"Minimo: 0.10% · Maximo: 10.00%",
				].join("\n")
			);
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
			const updated = await setTelegramUserSettings(effectiveChatId, {
				autoSignalsMode: mode,
				pendingSpreadTrack: null,
			});
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated),
				updated
			);
			return NextResponse.json({ ok: true });
		}

		// --- alerts:on / alerts:off ---
		if (callbackData === "alerts:on" || callbackData === "alerts:off") {
			const current = await getTelegramUserSettings(effectiveChatId);
			const enabling = callbackData === "alerts:on";
			const updated = await setTelegramUserSettings(effectiveChatId, {
				alertsEnabled: enabling,
				pausedUntil: enabling ? null : current.pausedUntil,
				pendingSpreadTrack: null,
			});
			const extra = enabling && !current.alertsEnabled
				? ["✅ Monitoramento iniciado pela primeira vez."]
				: [];
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated, extra),
				updated
			);
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
				pendingSpreadTrack: null,
			});
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated),
				updated
			);
			return NextResponse.json({ ok: true });
		}

		// --- spread_a:<value> ---
		if (callbackData.startsWith("spread_a:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v >= MIN_SPREAD_ALLOWED && v <= MAX_SPREAD_ALLOWED) {
				const updated = await setTelegramUserSettings(effectiveChatId, {
					minSpreadA: v,
					pendingSpreadTrack: null,
				});
				await confirmAndShowStatus(
					effectiveChatId,
					buildCleanSettingsConfirmation(updated),
					updated
				);
			} else {
				await sendTelegramMessage(
					effectiveChatId,
					"⚠️ Valor invalido. Digite entre 0.10 e 10.00"
				);
			}
			return NextResponse.json({ ok: true });
		}

		// --- spread_b:<value> ---
		if (callbackData.startsWith("spread_b:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v >= MIN_SPREAD_ALLOWED && v <= MAX_SPREAD_ALLOWED) {
				const updated = await setTelegramUserSettings(effectiveChatId, {
					minSpreadB: v,
					pendingSpreadTrack: null,
				});
				await confirmAndShowStatus(
					effectiveChatId,
					buildCleanSettingsConfirmation(updated),
					updated
				);
			} else {
				await sendTelegramMessage(
					effectiveChatId,
					"⚠️ Valor invalido. Digite entre 0.10 e 10.00"
				);
			}
			return NextResponse.json({ ok: true });
		}

		// --- spread_c:<value> ---
		if (callbackData.startsWith("spread_c:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v >= MIN_SPREAD_ALLOWED && v <= MAX_SPREAD_ALLOWED) {
				const updated = await setTelegramUserSettings(effectiveChatId, {
					minSpreadC: v,
					pendingSpreadTrack: null,
				});
				await confirmAndShowStatus(
					effectiveChatId,
					buildCleanSettingsConfirmation(updated),
					updated
				);
			} else {
				await sendTelegramMessage(
					effectiveChatId,
					"⚠️ Valor invalido. Digite entre 0.10 e 10.00"
				);
			}
			return NextResponse.json({ ok: true });
		}

		// --- capital:<value> ---
		if (callbackData.startsWith("capital:")) {
			const v = parseFloat(callbackData.split(":")[1]);
			if (Number.isFinite(v) && v > 0) {
				const updated = await setTelegramUserSettings(effectiveChatId, {
					simCapital: v,
					pendingSpreadTrack: null,
				});
				await confirmAndShowStatus(
					effectiveChatId,
					buildCleanSettingsConfirmation(updated),
					updated
				);
			}
			return NextResponse.json({ ok: true });
		}

		// --- silent:on / silent:off ---
		if (callbackData === "silent:on" || callbackData === "silent:off") {
			const updated = await setTelegramUserSettings(effectiveChatId, {
				silentNight: callbackData === "silent:on",
				pendingSpreadTrack: null,
			});
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated),
				updated
			);
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

		// --- pause:resume ---
		if (callbackData === "pause:resume") {
			const updated = await setTelegramUserSettings(effectiveChatId, {
				alertsEnabled: true,
				pausedUntil: null,
				pendingSpreadTrack: null,
			});
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated, [buildPauseConfirmMessage(null)]),
				updated
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
				: PAUSE_FOREVER;
			const updated = await setTelegramUserSettings(effectiveChatId, {
				alertsEnabled: true,
				pausedUntil,
				pendingSpreadTrack: null,
			});
			await confirmAndShowStatus(
				effectiveChatId,
				buildCleanSettingsConfirmation(updated, [buildPauseConfirmMessage(pausedUntil)]),
				updated
			);
			return NextResponse.json({ ok: true });
		}

		// --- plan:upgrade ---
		if (callbackData === "plan:upgrade") {
			await confirmAndBackToMenu(
				effectiveChatId,
				"✅ Acao concluida!\nEm breve entraremos em contato quando as assinaturas abrirem."
			);
			return NextResponse.json({ ok: true });
		}

		if (messageText) {
			const current = await getTelegramUserSettings(effectiveChatId);

			if (current.pendingSpreadTrack && !action) {
				const parsed = parseSpreadInput(messageText);
				if (
					parsed === null ||
					parsed < MIN_SPREAD_ALLOWED ||
					parsed > MAX_SPREAD_ALLOWED
				) {
					await sendTelegramMessage(
						effectiveChatId,
						"⚠️ Valor invalido. Digite entre 0.10 e 10.00"
					);
					return NextResponse.json({ ok: true });
				}

				const spreadField = spreadFieldByTrack(current.pendingSpreadTrack);
				const updated = await setTelegramUserSettings(effectiveChatId, {
					[spreadField]: parsed,
					pendingSpreadTrack: null,
				});

				await confirmAndShowStatus(
					effectiveChatId,
					buildCleanSettingsConfirmation(updated),
					updated
				);
				return NextResponse.json({ ok: true });
			}

			if (current.pendingSpreadTrack && action) {
				await setTelegramUserSettings(effectiveChatId, { pendingSpreadTrack: null });
			}
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
		help: "Envie /cadastro usuario senha ou /login usuario senha para liberar este chat. Depois use /start, /usdt, /usdt_defi, /scanner, /status ou /configurar.",
	});
}
