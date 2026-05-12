import { NextRequest, NextResponse } from "next/server";
import {
	buildTelegramAuthRequiredMessage,
	buildTelegramAuthRequiredMarkup,
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

// Fluxo conversacional de cadastro/login (persistido por chat, sem estado em memoria)
type ConversationStep = "cadastro_username" | "cadastro_password" | "login_username" | "login_password";

type ConversationState =
	| { step: "cadastro_username" }
	| { step: "cadastro_password"; username: string }
	| { step: "login_username" }
	| { step: "login_password"; username: string };
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
	await sendTelegramMessage(chatId, buildTelegramAuthRequiredMessage(), {
		reply_markup: buildTelegramAuthRequiredMarkup(),
	});
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

function tracksByAutoMode(mode: "off" | "usdt" | "scanner" | "usdt_defi" | "all") {
	if (mode === "usdt") return { a: true, b: false, c: false };
	if (mode === "scanner") return { a: false, b: true, c: false };
	if (mode === "usdt_defi") return { a: false, b: false, c: true };
	if (mode === "all") return { a: true, b: true, c: true };
	return { a: false, b: false, c: false };
}

async function saveSpreadWithAutoMonitoring(
	chatId: number | string,
	updates: Partial<Pick<TelegramUserSettings, "minSpreadA" | "minSpreadB" | "minSpreadC">>
): Promise<TelegramUserSettings> {
	const current = await getTelegramUserSettings(chatId);
	const shouldAutoEnable = !current.alertsEnabled && current.autoSignalsMode === "off";

	return setTelegramUserSettings(chatId, {
		...updates,
		pendingSpreadTrack: null,
		alertsEnabled: shouldAutoEnable ? true : current.alertsEnabled,
		autoSignalsMode: shouldAutoEnable ? "all" : current.autoSignalsMode,
		pausedUntil: shouldAutoEnable ? null : current.pausedUntil,
		alertTracks: shouldAutoEnable ? tracksByAutoMode("all") : current.alertTracks,
	});
}

async function restoreMonitoringAfterAuth(chatId: number | string): Promise<void> {
	const current = await getTelegramUserSettings(chatId);
	const nextMode = current.autoSignalsMode === "off" ? "all" : current.autoSignalsMode;

	await setTelegramUserSettings(chatId, {
		suppressDispatchUntilAuth: false,
		alertsEnabled: true,
		autoSignalsMode: nextMode,
		alertTracks: tracksByAutoMode(nextMode),
		pausedUntil: null,
		pendingSpreadTrack: null,
	});
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

async function deleteIncomingMessageIfPossible(
	chatId: number | string,
	messageId: number | null
): Promise<void> {
	if (messageId === null) return;
	try {
		await deleteTelegramMessage(chatId, messageId);
	} catch {
		// Ignore: bot may not have permission in some chat types.
	}
}

function getConversationStateFromSettings(settings: TelegramUserSettings): ConversationState | null {
	if (!settings.pendingAuthStep) return null;
	if (settings.pendingAuthStep === "cadastro_username") return { step: "cadastro_username" };
	if (settings.pendingAuthStep === "login_username") return { step: "login_username" };
	if (settings.pendingAuthStep === "cadastro_password" && settings.pendingAuthUsername) {
		return { step: "cadastro_password", username: settings.pendingAuthUsername };
	}
	if (settings.pendingAuthStep === "login_password" && settings.pendingAuthUsername) {
		return { step: "login_password", username: settings.pendingAuthUsername };
	}
	return null;
}

async function setConversationState(
	chatId: number | string,
	step: ConversationStep,
	username: string | null = null
): Promise<void> {
	await setTelegramUserSettings(chatId, {
		pendingAuthStep: step,
		pendingAuthUsername: username,
	});
}

async function clearConversationState(chatId: number | string): Promise<void> {
	await setTelegramUserSettings(chatId, {
		pendingAuthStep: null,
		pendingAuthUsername: null,
	});
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
		const settings = await setTelegramUserSettings(chatId, {
			autoSignalsMode: "usdt",
			alertsEnabled: true,
			alertTracks: tracksByAutoMode("usdt"),
			pausedUntil: null,
			pendingSpreadTrack: null,
		});
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
		await setTelegramUserSettings(chatId, {
			autoSignalsMode: "usdt_defi",
			alertsEnabled: true,
			alertTracks: tracksByAutoMode("usdt_defi"),
			pausedUntil: null,
			pendingSpreadTrack: null,
		});
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
	await setTelegramUserSettings(chatId, {
		autoSignalsMode: "scanner",
		alertsEnabled: true,
		alertTracks: tracksByAutoMode("scanner"),
		pausedUntil: null,
		pendingSpreadTrack: null,
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
		| { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number | string } } }
		| undefined;
	const callbackData = callbackQuery?.data ?? "";
	const callbackMessageId =
		typeof callbackQuery?.message?.message_id === "number" ? callbackQuery.message.message_id : null;
	const incomingMessageId = typeof update?.message?.message_id === "number" ? update.message.message_id : null;
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
		const authSettings = await getTelegramUserSettings(effectiveChatId);
		const convState = getConversationStateFromSettings(authSettings);

		// Fluxo conversacional: estado ativo
		if (convState && messageText && !messageText.startsWith("/")) {
			if (convState.step === "cadastro_username") {
				await deleteIncomingMessageIfPossible(effectiveChatId, incomingMessageId);
				const username = messageText.trim().toLowerCase();
				const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
				if (!isEmail) {
					await sendTelegramMessage(
						effectiveChatId,
						"⚠️ Digite um <b>email valido</b> para cadastro.\nExemplo: <code>voce@email.com</code>"
					);
					return NextResponse.json({ ok: true });
				}
				await setConversationState(effectiveChatId, "cadastro_password", username);
				await sendTelegramMessage(
					effectiveChatId,
					"🔒 Agora digite sua <b>senha</b>:\n\n💡 Use letras, números e símbolos para uma senha forte."
				);
				return NextResponse.json({ ok: true });
			}

			if (convState.step === "cadastro_password") {
				await deleteIncomingMessageIfPossible(effectiveChatId, incomingMessageId);
				const password = messageText.trim();
				await clearConversationState(effectiveChatId);
				try {
					const user = await registerTelegramUser({
						username: convState.username,
						password,
						chatId: effectiveChatId,
					});
					await restoreMonitoringAfterAuth(effectiveChatId);
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>🎉 Cadastro Realizado com Sucesso!</b>",
							"",
							`👤 Usuário: <b>${user.username}</b>`,
							"✅ Chat autenticado e vinculado",
							"",
							"━━━━━━━━━━━━━━━━━━━━━━",
							"Você já pode:",
							"🚀 Acessar o menu completo",
							"📊 Receber sinais de arbitragem",
							"⚙️ Configurar suas preferências",
							"🤖 Ativar monitoramento automático",
							"",
							"Use /start para abrir o menu!",
						].join("\n")
					);
					await handleAction("menu", request.nextUrl.origin, effectiveChatId);
				} catch (error) {
					const message = error instanceof Error ? error.message : "Falha ao cadastrar usuario";
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>❌ Erro ao Cadastrar</b>",
							"",
							`⚠️ ${message}`,
							"",
							"Tente novamente com /cadastro",
						].join("\n")
					);
				}
				return NextResponse.json({ ok: true });
			}

			if (convState.step === "login_username") {
				await deleteIncomingMessageIfPossible(effectiveChatId, incomingMessageId);
				const username = messageText.trim().toLowerCase();
				await setConversationState(effectiveChatId, "login_password", username);
				await sendTelegramMessage(effectiveChatId, "🔒 Agora digite sua <b>senha</b>:");
				return NextResponse.json({ ok: true });
			}

			if (convState.step === "login_password") {
				await deleteIncomingMessageIfPossible(effectiveChatId, incomingMessageId);
				const password = messageText.trim();
				await clearConversationState(effectiveChatId);
				const user = await linkTelegramChatToUser({
					username: convState.username,
					password,
					chatId: effectiveChatId,
				});
				if (!user) {
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>❌ Login Inválido</b>",
							"",
							"Usuário ou senha incorretos.",
							"Tente novamente com /login",
						].join("\n")
					);
				} else {
						await restoreMonitoringAfterAuth(effectiveChatId);
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>🔓 Login Realizado com Sucesso!</b>",
							"",
							`👤 Bem-vindo de volta, <b>${user.username}</b>!`,
							"✅ Chat autenticado com sucesso",
							"",
							"Use /start para abrir o menu!",
						].join("\n")
					);
					await handleAction("menu", request.nextUrl.origin, effectiveChatId);
				}
				return NextResponse.json({ ok: true });
			}
		}

		// Iniciar fluxo conversacional via /cadastro ou /login sem argumentos
		if (messageText.toLowerCase() === "/cadastro") {
			await setConversationState(effectiveChatId, "cadastro_username");
			await sendTelegramMessage(
				effectiveChatId,
				"👋 Vamos criar sua conta!\n\nDigite seu <b>email</b>:"
			);
			return NextResponse.json({ ok: true });
		}

		if (messageText.toLowerCase() === "/login") {
			await setConversationState(effectiveChatId, "login_username");
			await sendTelegramMessage(effectiveChatId, "🔑 Digite seu <b>email</b>:");
			return NextResponse.json({ ok: true });
		}

		if (credentialsCommand) {
			await deleteIncomingMessageIfPossible(effectiveChatId, incomingMessageId);
			await clearConversationState(effectiveChatId);
			if (!credentialsCommand.username || !credentialsCommand.password) {
				await sendTelegramMessage(
					effectiveChatId,
					credentialsCommand.command === "login"
						? "Use /login seu_email sua_senha"
						: "Use /cadastro seu_email sua_senha"
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
					await restoreMonitoringAfterAuth(effectiveChatId);
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>🎉 Cadastro Realizado com Sucesso!</b>",
							"",
							`👤 Usuário: <b>${user.username}</b>`,
							"✅ Chat autenticado e vinculado",
							"",
							"━━━━━━━━━━━━━━━━━━━━━━",
							"Você já pode:",
							"🚀 Acessar o menu completo",
							"📊 Receber sinais de arbitragem",
							"⚙️ Configurar suas preferências",
							"🤖 Ativar monitoramento automático",
							"",
							"Use /start para abrir o menu!",
						].join("\n")
					);
					await handleAction("menu", request.nextUrl.origin, effectiveChatId);
					return NextResponse.json({ ok: true });
				} catch (error) {
					const message = error instanceof Error ? error.message : "Falha ao cadastrar usuario";
					await sendTelegramMessage(
						effectiveChatId,
						[
							"<b>❌ Erro ao Cadastrar</b>",
							"",
							`⚠️ ${message}`,
							"",
							"Tente novamente com:",
							"<code>/cadastro seu_email sua_senha</code>",
							"",
							"💡 Dica: Use uma senha forte com letras, números e símbolos.",
						].join("\n")
					);
					return NextResponse.json({ ok: true });
				}
			}

			const user = await linkTelegramChatToUser({
				username: credentialsCommand.username,
				password: credentialsCommand.password,
				chatId: effectiveChatId,
			});
			if (!user) {
				await sendTelegramMessage(
					effectiveChatId,
					[
						"<b>❌ Login Inválido</b>",
						"",
						"Usuário ou senha incorretos, ou acesso desativado.",
						"",
						"Verifique os dados e tente novamente:",
						"<code>/login seu_email sua_senha</code>",
						"",
						"Caso não tenha conta, crie uma com:",
						"<code>/cadastro seu_email sua_senha</code>",
						"",
						"Ainda com dúvidas? Use /help",
					].join("\n")
				);
				return NextResponse.json({ ok: true });
			}

			await restoreMonitoringAfterAuth(effectiveChatId);
			await sendTelegramMessage(
				effectiveChatId,
				[
					"<b>🔓 Login Realizado com Sucesso!</b>",
					"",
					`👤 Bem-vindo de volta, <b>${user.username}</b>!`,
					"✅ Chat autenticado com sucesso",
					"",
					"━━━━━━━━━━━━━━━━━━━━━━",
					"Pronto para:",
					"💱 Acompanhar arbitragens",
					"📡 Receber sinais do scanner",
					"🎯 Monitorar oportunidades",
					"",
					"Use /start para abrir o menu!",
				].join("\n")
			);
			await handleAction("menu", request.nextUrl.origin, effectiveChatId);
			return NextResponse.json({ ok: true });
		}

		if (messageText.toLowerCase() === "/logout") {
			await clearConversationState(effectiveChatId);
			await unlinkTelegramChat(effectiveChatId);
			await setTelegramUserSettings(effectiveChatId, {
				autoSignalsMode: "off",
				alertsEnabled: false,
				alertTracks: { a: false, b: false, c: false },
				suppressDispatchUntilAuth: true,
				pausedUntil: PAUSE_FOREVER,
				pendingSpreadTrack: null,
			});
			await sendTelegramMessage(
				effectiveChatId,
				[
					"<b>👋 Desconectado com Sucesso!</b>",
					"",
					"Este chat foi removido do bot.",
					"",
					"Para voltar a usar:",
					"<code>/login seu_email sua_senha</code>",
					"",
					"ou crie uma nova conta:",
					"<code>/cadastro seu_email sua_senha</code>",
				].join("\n")
			);
			return NextResponse.json({ ok: true });
		}

		if (callbackData === "account:cadastro") {
			await setConversationState(effectiveChatId, "cadastro_username");
			await sendTelegramMessage(
				effectiveChatId,
				"👋 Vamos criar sua conta!\n\nDigite seu <b>email</b>:"
			);
			return NextResponse.json({ ok: true });
		}

		if (callbackData === "account:login") {
			await setConversationState(effectiveChatId, "login_username");
			await sendTelegramMessage(effectiveChatId, "🔑 Digite seu <b>email</b>:");
			return NextResponse.json({ ok: true });
		}

		if (callbackData === "account:help") {
			await sendTelegramMessage(effectiveChatId, buildTelegramHelpMessage());
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

		// --- account:logout ---
		if (callbackData === "account:logout") {
			await clearConversationState(effectiveChatId);
			await unlinkTelegramChat(effectiveChatId);
			await setTelegramUserSettings(effectiveChatId, {
				autoSignalsMode: "off",
				alertsEnabled: false,
				alertTracks: { a: false, b: false, c: false },
				suppressDispatchUntilAuth: true,
				pausedUntil: PAUSE_FOREVER,
				pendingSpreadTrack: null,
			});
			await sendTelegramMessage(
				effectiveChatId,
				"🚪 Logout realizado. Este chat foi desvinculado da sua conta.\nUse /login para entrar novamente quando quiser."
			);
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
			const tracks = tracksByAutoMode(mode);
			const isMonitoringEnabled = mode !== "off";
			const updated = await setTelegramUserSettings(effectiveChatId, {
				autoSignalsMode: mode,
				alertsEnabled: isMonitoringEnabled,
				alertTracks: tracks,
				pausedUntil: isMonitoringEnabled ? null : PAUSE_FOREVER,
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
				pausedUntil: enabling ? null : PAUSE_FOREVER,
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
				const updated = await saveSpreadWithAutoMonitoring(effectiveChatId, {
					minSpreadA: v,
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
				const updated = await saveSpreadWithAutoMonitoring(effectiveChatId, {
					minSpreadB: v,
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
				const updated = await saveSpreadWithAutoMonitoring(effectiveChatId, {
					minSpreadC: v,
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

		// --- dispatch:now (verificacao manual) ---
		if (callbackData === "dispatch:now") {
			const currentSettings = await getTelegramUserSettings(effectiveChatId);

			if (!currentSettings.alertsEnabled) {
				await sendTelegramMessage(effectiveChatId, "⚠️ Monitoramento desativado.");
				return NextResponse.json({ ok: true });
			}

			const tracks: Array<"a" | "b" | "c"> = [];
			if (currentSettings.alertTracks.a) tracks.push("a");
			if (currentSettings.alertTracks.b) tracks.push("b");
			if (currentSettings.alertTracks.c) tracks.push("c");

			if (tracks.length === 0) {
				await sendTelegramMessage(effectiveChatId, "⚠️ Nenhuma trilha ativa.");
				return NextResponse.json({ ok: true });
			}

			await sendTelegramMessage(effectiveChatId, "🔄 Verificando oportunidades agora...");

			const chatIdParam = encodeURIComponent(String(effectiveChatId));
			const dispatchUrl = new URL(`/api/telegram/dispatch?source=manual&chat_id=${chatIdParam}`, request.nextUrl.origin);
			const headers: Record<string, string> = { accept: "application/json" };
			const secret = process.env.CRON_SECRET?.trim();
			if (secret) {
				headers.authorization = `Bearer ${secret}`;
			}

			const dispatchResponse = await fetch(dispatchUrl, {
				method: "GET",
				cache: "no-store",
				headers,
			});

			if (!dispatchResponse.ok) {
				await sendTelegramMessage(effectiveChatId, "⚠️ Falha ao verificar agora. Tente novamente em instantes.");
				return NextResponse.json({ ok: true });
			}

			const payload = await dispatchResponse.json().catch(() => null) as { sent?: number } | null;
			if (!payload || !payload.sent || payload.sent <= 0) {
				await sendTelegramMessage(effectiveChatId, "ℹ️ Nenhuma oportunidade acima do minimo no momento.");
			}
			await sendMonitoringStatus(effectiveChatId);
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
				const updated = await saveSpreadWithAutoMonitoring(effectiveChatId, {
					[spreadField]: parsed,
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
		help: "Envie /cadastro email senha ou /login email senha para liberar este chat. Depois use /start, /usdt, /usdt_defi, /scanner, /status ou /configurar.",
	});
}
