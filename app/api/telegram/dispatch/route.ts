import { NextRequest, NextResponse } from "next/server";
import {
	buildScannerSignalMessage,
	buildSignalDigest,
	buildTelegramSignalMarkup,
	buildUsdtSignalMessage,
	isAllowedTelegramChat,
	sendTelegramMessage,
} from "@/lib/telegram";
import {
	getTelegramUserSettings,
	listTelegramUserSettings,
	setTelegramUserSettings,
} from "@/lib/telegram-user-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
	const secret = process.env.CRON_SECRET?.trim();
	if (!secret) {
		return true;
	}

	const authHeader = request.headers.get("authorization") ?? "";
	return authHeader === `Bearer ${secret}`;
}

async function dispatchUsdt(chatId: string, origin: string): Promise<"sent" | "skipped"> {
	const settings = await getTelegramUserSettings(chatId);
	const message = await buildUsdtSignalMessage(origin, {
		includeDefiBrla: settings.includeDefiBrla,
		autoSignalsMode: settings.autoSignalsMode,
	});
	const digest = buildSignalDigest(message);

	if (settings.lastUsdtDigest === digest) {
		return "skipped";
	}

	await sendTelegramMessage(chatId, message, {
		reply_markup: buildTelegramSignalMarkup("usdt"),
	});

	await setTelegramUserSettings(chatId, { lastUsdtDigest: digest });
	return "sent";
}

async function dispatchScanner(chatId: string, origin: string): Promise<"sent" | "skipped"> {
	const settings = await getTelegramUserSettings(chatId);
	const message = await buildScannerSignalMessage(origin);
	const digest = buildSignalDigest(message);

	if (settings.lastScannerDigest === digest) {
		return "skipped";
	}

	await sendTelegramMessage(chatId, message, {
		reply_markup: buildTelegramSignalMarkup("scanner"),
	});

	await setTelegramUserSettings(chatId, { lastScannerDigest: digest });
	return "sent";
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
		const chatId = user.chatId;
		const mode = user.settings.autoSignalsMode;

		if (!isAllowedTelegramChat(chatId)) {
			skipped += 1;
			continue;
		}

		if (mode === "off") {
			skipped += 1;
			continue;
		}

		try {
			if (mode === "usdt" || mode === "both") {
				const result = await dispatchUsdt(chatId, origin);
				if (result === "sent") sent += 1;
				if (result === "skipped") skipped += 1;
			}

			if (mode === "scanner" || mode === "both") {
				const result = await dispatchScanner(chatId, origin);
				if (result === "sent") sent += 1;
				if (result === "skipped") skipped += 1;
			}
		} catch (error) {
			failed += 1;
			console.error("[TELEGRAM] Falha ao despachar sinais automaticos:", { chatId, mode, error });
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