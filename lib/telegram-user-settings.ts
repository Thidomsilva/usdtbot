import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

export type TelegramUserSettings = {
	includeDefiBrla: boolean;
	autoSignalsMode: "off" | "usdt" | "scanner" | "usdt_defi" | "all";
	lastUsdtDigest: string | null;
	lastScannerDigest: string | null;
	lastUsdtDefiDigest: string | null;
};

type TelegramSettingsStore = {
	users: Record<string, TelegramUserSettings>;
};

const DEFAULT_SETTINGS: TelegramUserSettings = {
	includeDefiBrla: false,
	autoSignalsMode: "off",
	lastUsdtDigest: null,
	lastScannerDigest: null,
	lastUsdtDefiDigest: null,
};

const DATA_DIR = process.env.VERCEL
	? path.join("/tmp", "usdtbot")
	: path.join(process.cwd(), "data");

const SETTINGS_FILE = path.join(DATA_DIR, "telegram-settings.json");

function cloneDefaultSettings(): TelegramUserSettings {
	return { ...DEFAULT_SETTINGS };
}

function normalizeSettings(value: unknown): TelegramUserSettings {
	if (!value || typeof value !== "object") {
		return cloneDefaultSettings();
	}

	const candidate = value as Partial<TelegramUserSettings>;
	return {
		includeDefiBrla: candidate.includeDefiBrla === true,
		autoSignalsMode:
			candidate.autoSignalsMode === "usdt" ||
			candidate.autoSignalsMode === "scanner" ||
			candidate.autoSignalsMode === "usdt_defi" ||
			candidate.autoSignalsMode === "all"
				? candidate.autoSignalsMode
				: String((candidate as { autoSignalsMode?: string }).autoSignalsMode) === "both"
					? "all"
				: "off",
		lastUsdtDigest: typeof candidate.lastUsdtDigest === "string" ? candidate.lastUsdtDigest : null,
		lastScannerDigest:
			typeof candidate.lastScannerDigest === "string" ? candidate.lastScannerDigest : null,
		lastUsdtDefiDigest:
			typeof candidate.lastUsdtDefiDigest === "string" ? candidate.lastUsdtDefiDigest : null,
	};
}

function normalizeStore(value: unknown): TelegramSettingsStore {
	if (!value || typeof value !== "object") {
		return { users: {} };
	}

	const candidate = value as Partial<TelegramSettingsStore>;
	const users = candidate.users && typeof candidate.users === "object" ? candidate.users : {};
	const normalizedUsers: Record<string, TelegramUserSettings> = {};

	for (const [chatId, settings] of Object.entries(users)) {
		normalizedUsers[chatId] = normalizeSettings(settings);
	}

	return { users: normalizedUsers };
}

async function loadStore(): Promise<TelegramSettingsStore> {
	try {
		const raw = await readFile(SETTINGS_FILE, "utf8");
		return normalizeStore(JSON.parse(raw));
	} catch {
		return { users: {} };
	}
}

async function saveStore(store: TelegramSettingsStore): Promise<void> {
	await mkdir(DATA_DIR, { recursive: true });
	const tmpFile = `${SETTINGS_FILE}.${Date.now()}.tmp`;
	await writeFile(tmpFile, JSON.stringify(store, null, 2), "utf8");
	await rename(tmpFile, SETTINGS_FILE);
}

export async function getTelegramUserSettings(chatId: number | string): Promise<TelegramUserSettings> {
	const store = await loadStore();
	const key = String(chatId);
	return normalizeSettings(store.users[key]);
}

export async function setTelegramUserSettings(
	chatId: number | string,
	next: Partial<TelegramUserSettings>
): Promise<TelegramUserSettings> {
	const key = String(chatId);
	const store = await loadStore();
	const current = normalizeSettings(store.users[key]);

	const updated: TelegramUserSettings = {
		includeDefiBrla:
			typeof next.includeDefiBrla === "boolean"
				? next.includeDefiBrla
				: current.includeDefiBrla,
		autoSignalsMode:
			next.autoSignalsMode === "usdt" ||
			next.autoSignalsMode === "scanner" ||
			next.autoSignalsMode === "usdt_defi" ||
			next.autoSignalsMode === "all" ||
			next.autoSignalsMode === "off"
				? next.autoSignalsMode
				: current.autoSignalsMode,
		lastUsdtDigest:
			typeof next.lastUsdtDigest === "string" || next.lastUsdtDigest === null
				? (next.lastUsdtDigest ?? null)
				: current.lastUsdtDigest,
		lastScannerDigest:
			typeof next.lastScannerDigest === "string" || next.lastScannerDigest === null
				? (next.lastScannerDigest ?? null)
				: current.lastScannerDigest,
		lastUsdtDefiDigest:
			typeof next.lastUsdtDefiDigest === "string" || next.lastUsdtDefiDigest === null
				? (next.lastUsdtDefiDigest ?? null)
				: current.lastUsdtDefiDigest,
	};

	store.users[key] = updated;
	await saveStore(store);
	return updated;
}

export async function toggleTelegramDefiBrla(chatId: number | string): Promise<TelegramUserSettings> {
	const current = await getTelegramUserSettings(chatId);
	return setTelegramUserSettings(chatId, {
		includeDefiBrla: !current.includeDefiBrla,
	});
}

export async function listTelegramUserSettings(): Promise<Array<{ chatId: string; settings: TelegramUserSettings }>> {
	const store = await loadStore();
	return Object.entries(store.users).map(([chatId, settings]) => ({
		chatId,
		settings: normalizeSettings(settings),
	}));
}