import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { type UserPlan, temAcesso, maxAlertasPerDay } from "@/lib/plans";
import { Redis } from "@upstash/redis";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createRedisClient, type RedisClientType } from "redis";

export type AlertTracks = { a: boolean; b: boolean; c: boolean; d: boolean };
export type DispatchTrackStatus = "sent" | "skipped" | "failed" | null;
export type { UserPlan };

export type TelegramUserSettings = {
	// legacy
	includeDefiBrla: boolean;
	autoSignalsMode: "off" | "usdt" | "scanner" | "usdt_defi" | "all";
	lastUsdtDigest: string | null;
	lastScannerDigest: string | null;
	lastUsdtDefiDigest: string | null;

	// alert system
	alertsEnabled: boolean;
	alertTracks: AlertTracks;
	minSpreadA: number;
	minSpreadB: number;
	minSpreadC: number;
	minSpreadD: number;
	simCapital: number;
	silentNight: boolean;
	silentStart: string;
	silentEnd: string;
	pendingSpreadTrack: "a" | "b" | "c" | null;
	pendingAuthStep: "cadastro_username" | "cadastro_password" | "login_username" | "login_password" | null;
	pendingAuthUsername: string | null;
	suppressDispatchUntilAuth: boolean;
	pausedUntil: number | null;
	alertsThisHour: number;
	alertsHourReset: number;
	alertsToday: number;
	alertsDayReset: number;
	lastAlertA: number | null;
	lastAlertB: Record<string, number>;
	lastAlertC: number | null;
	lastAlertD: number | null;
	lastDispatchAtA: number | null;
	lastDispatchAtB: number | null;
	lastDispatchAtC: number | null;
	lastDispatchAtD: number | null;
	lastDispatchStatusA: DispatchTrackStatus;
	lastDispatchStatusB: DispatchTrackStatus;
	lastDispatchStatusC: DispatchTrackStatus;
	lastDispatchStatusD: DispatchTrackStatus;
	lastDispatchReasonA: string | null;
	lastDispatchReasonB: string | null;
	lastDispatchReasonC: string | null;
	lastDispatchReasonD: string | null;
	lastCronAt: number | null;
	plan: UserPlan;
	// extended plan fields
	planActive: boolean;
	planExpiresAt: number | null;
	trialUsed: boolean;
	// plan start date (epoch ms)
	planStartedAt: number | null;
};

type TelegramSettingsStore = {
	users: Record<string, TelegramUserSettings>;
};

type StorageBackend = "file" | "kv-rest" | "kv-redis-url" | "supabase";

const DEFAULT_SETTINGS: TelegramUserSettings = {
	includeDefiBrla: false,
	autoSignalsMode: "off",
	lastUsdtDigest: null,
	lastScannerDigest: null,
	lastUsdtDefiDigest: null,

	alertsEnabled: false,
	alertTracks: { a: true, b: true, c: true, d: false },
	minSpreadA: 0.5,
	minSpreadB: 2.0,
	minSpreadC: 0.1,
	minSpreadD: 0.3,
	simCapital: 1000,
	silentNight: false,
	silentStart: "23:00",
	silentEnd: "07:00",
	pendingSpreadTrack: null,
	pendingAuthStep: null,
	pendingAuthUsername: null,
	suppressDispatchUntilAuth: false,
	pausedUntil: null,
	alertsThisHour: 0,
	alertsHourReset: 0,
	alertsToday: 0,
	alertsDayReset: 0,
	lastAlertA: null,
	lastAlertB: {},
	lastAlertC: null,
	lastAlertD: null,
	lastDispatchAtA: null,
	lastDispatchAtB: null,
	lastDispatchAtC: null,
	lastDispatchAtD: null,
	lastDispatchStatusA: null,
	lastDispatchStatusB: null,
	lastDispatchStatusC: null,
	lastDispatchStatusD: null,
	lastDispatchReasonA: null,
	lastDispatchReasonB: null,
	lastDispatchReasonC: null,
	lastDispatchReasonD: null,
	lastCronAt: null,
	plan: "free",
	planActive: true,
	planExpiresAt: null,
	trialUsed: false,
	planStartedAt: null,
};

const DATA_DIR = process.env.VERCEL
	? path.join("/tmp", "usdtbot")
	: path.join(process.cwd(), "data");

const SETTINGS_FILE = path.join(DATA_DIR, "telegram-settings.json");
const KV_TELEGRAM_SETTINGS_KEY = "usdtbot:telegram-settings:v1";
const SUPABASE_STORAGE_TABLE = (process.env.SUPABASE_STORAGE_TABLE ?? "app_storage").trim();

let redisClient: Redis | null = null;
let redisUrlClient: RedisClientType | null = null;
let redisUrlConnecting: Promise<RedisClientType> | null = null;
let supabaseClient: SupabaseClient | null = null;

function shouldRequireDurableStorage(): boolean {
	return Boolean(process.env.VERCEL) && process.env.ALLOW_EPHEMERAL_USER_STORAGE !== "true";
}

function canUseLocalFileFallback(): boolean {
	return !shouldRequireDurableStorage();
}

function getFirstEnv(keys: string[]): string | undefined {
	for (const key of keys) {
		const value = process.env[key]?.trim();
		if (value) return value;
	}
	return undefined;
}

function getRestUrl(): string | undefined {
	return getFirstEnv([
		"KV_REST_API_URL",
		"UPSTASH_REDIS_REST_URL",
		"STORAGE_REST_URL",
		"REDIS_REST_URL",
	]);
}

function getRestToken(): string | undefined {
	return getFirstEnv([
		"KV_REST_API_TOKEN",
		"UPSTASH_REDIS_REST_TOKEN",
		"STORAGE_REST_TOKEN",
		"REDIS_REST_TOKEN",
	]);
}

function getRedisConnectionUrl(): string | undefined {
	return getFirstEnv([
		"KV_REST_API_REDIS_URL",
		"REDIS_URL",
		"KV_URL",
		"UPSTASH_REDIS_URL",
		"STORAGE_URL",
	]);
}

function getSupabaseUrl(): string | undefined {
	return getFirstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]);
}

function getSupabaseServiceRoleKey(): string | undefined {
	return getFirstEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
}

function getStorageBackend(): StorageBackend {
	if (getSupabaseUrl() && getSupabaseServiceRoleKey()) return "supabase";
	if (getRestUrl() && getRestToken()) return "kv-rest";
	if (getRedisConnectionUrl()) return "kv-redis-url";
	return "file";
}

function assertDurableStorage(backend: StorageBackend): void {
	if (backend !== "file") return;
	if (!shouldRequireDurableStorage()) return;
	throw new Error(
		"Storage persistente para configuracoes do Telegram nao configurado. Em deploy Vercel, conecte Supabase ou Redis/KV."
	);
}

function getRedisClient(): Redis {
	if (!redisClient) {
		const restUrl = getRestUrl();
		const restToken = getRestToken();
		if (restUrl && restToken) redisClient = new Redis({ url: restUrl, token: restToken });
		else redisClient = Redis.fromEnv();
	}
	return redisClient;
}

function getRedisUrl(): string {
	const url = getRedisConnectionUrl();
	if (!url) {
		throw new Error("URL do Redis nao configurada (KV_REST_API_REDIS_URL/REDIS_URL/KV_URL/UPSTASH_REDIS_URL/STORAGE_URL)");
	}
	return url;
}

async function getRedisUrlClient(): Promise<RedisClientType> {
	if (!redisUrlClient) {
		redisUrlClient = createRedisClient({ url: getRedisUrl() });
	}

	if (!redisUrlClient.isOpen) {
		if (!redisUrlConnecting) {
			redisUrlConnecting = redisUrlClient.connect().finally(() => {
				redisUrlConnecting = null;
			});
		}
		await redisUrlConnecting;
	}

	return redisUrlClient;
}

function getSupabaseClient(): SupabaseClient {
	if (supabaseClient) return supabaseClient;

	const url = getSupabaseUrl();
	const serviceRoleKey = getSupabaseServiceRoleKey();
	if (!url || !serviceRoleKey) {
		throw new Error("Supabase nao configurado (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)");
	}

	supabaseClient = createSupabaseClient(url, serviceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});

	return supabaseClient;
}

function cloneDefaultSettings(): TelegramUserSettings {
	return { ...DEFAULT_SETTINGS };
}

function normalizeAlertTracks(value: unknown): AlertTracks {
	if (!value || typeof value !== "object") {
		return { a: true, b: true, c: true, d: false };
	}
	const t = value as Partial<AlertTracks>;
	return {
		a: t.a !== false,
		b: t.b !== false,
		c: t.c !== false,
		d: t.d === true,
	};
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeEpoch(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeDispatchStatus(value: unknown): DispatchTrackStatus {
	if (value === "sent" || value === "skipped" || value === "failed") return value;
	return null;
}

function normalizeSettings(value: unknown): TelegramUserSettings {
	if (!value || typeof value !== "object") {
		return cloneDefaultSettings();
	}

	const c = value as Record<string, unknown>;
	const autoSignalsMode = (() => {
		const v = c["autoSignalsMode"];
		if (v === "usdt" || v === "scanner" || v === "usdt_defi" || v === "all") return v;
		if (String(v) === "both") return "all" as const;
		return "off" as const;
	})();

	return {
		includeDefiBrla: c["includeDefiBrla"] === true,
		autoSignalsMode,
		lastUsdtDigest: typeof c["lastUsdtDigest"] === "string" ? c["lastUsdtDigest"] : null,
		lastScannerDigest: typeof c["lastScannerDigest"] === "string" ? c["lastScannerDigest"] : null,
		lastUsdtDefiDigest: typeof c["lastUsdtDefiDigest"] === "string" ? c["lastUsdtDefiDigest"] : null,

		alertsEnabled: c["alertsEnabled"] === true,
		alertTracks: normalizeAlertTracks(c["alertTracks"]),
		minSpreadA: normalizePositiveNumber(c["minSpreadA"], DEFAULT_SETTINGS.minSpreadA),
		minSpreadB: normalizePositiveNumber(c["minSpreadB"], DEFAULT_SETTINGS.minSpreadB),
		minSpreadC: normalizePositiveNumber(c["minSpreadC"], DEFAULT_SETTINGS.minSpreadC),
		minSpreadD: normalizePositiveNumber(c["minSpreadD"], DEFAULT_SETTINGS.minSpreadD),
		simCapital: normalizePositiveNumber(c["simCapital"], DEFAULT_SETTINGS.simCapital),
		silentNight: c["silentNight"] === true,
		silentStart: typeof c["silentStart"] === "string" ? c["silentStart"] : DEFAULT_SETTINGS.silentStart,
		silentEnd: typeof c["silentEnd"] === "string" ? c["silentEnd"] : DEFAULT_SETTINGS.silentEnd,
		pendingSpreadTrack:
			c["pendingSpreadTrack"] === "a" || c["pendingSpreadTrack"] === "b" || c["pendingSpreadTrack"] === "c"
				? c["pendingSpreadTrack"]
				: null,
		pendingAuthStep:
			c["pendingAuthStep"] === "cadastro_username" ||
			c["pendingAuthStep"] === "cadastro_password" ||
			c["pendingAuthStep"] === "login_username" ||
			c["pendingAuthStep"] === "login_password"
				? c["pendingAuthStep"]
				: null,
		pendingAuthUsername: typeof c["pendingAuthUsername"] === "string" ? c["pendingAuthUsername"] : null,
		suppressDispatchUntilAuth: c["suppressDispatchUntilAuth"] === true,
		pausedUntil: typeof c["pausedUntil"] === "number" ? c["pausedUntil"] : null,
		alertsThisHour: normalizeEpoch(c["alertsThisHour"]),
		alertsHourReset: normalizeEpoch(c["alertsHourReset"]),
		alertsToday: normalizeEpoch(c["alertsToday"]),
		alertsDayReset: normalizeEpoch(c["alertsDayReset"]),
		lastAlertA: typeof c["lastAlertA"] === "number" ? c["lastAlertA"] : null,
		lastAlertB: (c["lastAlertB"] && typeof c["lastAlertB"] === "object" && !Array.isArray(c["lastAlertB"]))
			? (c["lastAlertB"] as Record<string, number>)
			: {},
		lastAlertC: typeof c["lastAlertC"] === "number" ? c["lastAlertC"] : null,
		lastAlertD: typeof c["lastAlertD"] === "number" ? c["lastAlertD"] : null,
		lastDispatchAtA: typeof c["lastDispatchAtA"] === "number" ? c["lastDispatchAtA"] : null,
		lastDispatchAtB: typeof c["lastDispatchAtB"] === "number" ? c["lastDispatchAtB"] : null,
		lastDispatchAtC: typeof c["lastDispatchAtC"] === "number" ? c["lastDispatchAtC"] : null,
		lastDispatchAtD: typeof c["lastDispatchAtD"] === "number" ? c["lastDispatchAtD"] : null,
		lastDispatchStatusA: normalizeDispatchStatus(c["lastDispatchStatusA"]),
		lastDispatchStatusB: normalizeDispatchStatus(c["lastDispatchStatusB"]),
		lastDispatchStatusC: normalizeDispatchStatus(c["lastDispatchStatusC"]),
		lastDispatchStatusD: normalizeDispatchStatus(c["lastDispatchStatusD"]),
		lastDispatchReasonA: typeof c["lastDispatchReasonA"] === "string" ? c["lastDispatchReasonA"] : null,
		lastDispatchReasonB: typeof c["lastDispatchReasonB"] === "string" ? c["lastDispatchReasonB"] : null,
		lastDispatchReasonC: typeof c["lastDispatchReasonC"] === "string" ? c["lastDispatchReasonC"] : null,
		lastDispatchReasonD: typeof c["lastDispatchReasonD"] === "string" ? c["lastDispatchReasonD"] : null,
		lastCronAt: typeof c["lastCronAt"] === "number" ? c["lastCronAt"] : null,
		plan: c["plan"] === "pro" ? "pro" : c["plan"] === "admin" ? "admin" : "free",
		planActive: c["planActive"] !== false,
		planExpiresAt: typeof c["planExpiresAt"] === "number" ? c["planExpiresAt"] : null,
		trialUsed: c["trialUsed"] === true,
		planStartedAt: typeof c["planStartedAt"] === "number" ? c["planStartedAt"] : null,
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
	const backend = getStorageBackend();
	assertDurableStorage(backend);

	if (backend === "supabase") {
		try {
			const client = getSupabaseClient();
			const { data, error } = await client
				.from(SUPABASE_STORAGE_TABLE)
				.select("value")
				.eq("key", KV_TELEGRAM_SETTINGS_KEY)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data || !("value" in data)) return { users: {} };
			return normalizeStore((data as { value: unknown }).value);
		} catch (error) {
			if (!canUseLocalFileFallback()) throw error;
		}
	}

	if (backend === "kv-rest") {
		try {
			const store = await getRedisClient().get<TelegramSettingsStore>(KV_TELEGRAM_SETTINGS_KEY);
			return normalizeStore(store);
		} catch (error) {
			if (!canUseLocalFileFallback()) throw error;
		}
	}

	if (backend === "kv-redis-url") {
		try {
			const client = await getRedisUrlClient();
			const raw = await client.get(KV_TELEGRAM_SETTINGS_KEY);
			if (!raw || typeof raw !== "string") return { users: {} };
			return normalizeStore(JSON.parse(raw));
		} catch (error) {
			if (!canUseLocalFileFallback()) throw error;
		}
	}

	try {
		const raw = await readFile(SETTINGS_FILE, "utf8");
		return normalizeStore(JSON.parse(raw));
	} catch {
		return { users: {} };
	}
}

async function saveStore(store: TelegramSettingsStore): Promise<void> {
	const backend = getStorageBackend();
	assertDurableStorage(backend);

	try {
		if (backend === "supabase") {
			const client = getSupabaseClient();
			const { error } = await client
				.from(SUPABASE_STORAGE_TABLE)
				.upsert(
					{
						key: KV_TELEGRAM_SETTINGS_KEY,
						value: store,
						updated_at: new Date().toISOString(),
					},
					{ onConflict: "key" }
				);
			if (error) throw new Error(error.message);
			return;
		}

		if (backend === "kv-rest") {
			await getRedisClient().set(KV_TELEGRAM_SETTINGS_KEY, store);
			return;
		}

		if (backend === "kv-redis-url") {
			const client = await getRedisUrlClient();
			await client.set(KV_TELEGRAM_SETTINGS_KEY, JSON.stringify(store));
			return;
		}

		await mkdir(DATA_DIR, { recursive: true });
		const tmpFile = `${SETTINGS_FILE}.${Date.now()}.tmp`;
		await writeFile(tmpFile, JSON.stringify(store, null, 2), "utf8");
		await rename(tmpFile, SETTINGS_FILE);
	} catch (error) {
		if (!canUseLocalFileFallback()) throw error;
		await mkdir(DATA_DIR, { recursive: true });
		const tmpFile = `${SETTINGS_FILE}.${Date.now()}.tmp`;
		await writeFile(tmpFile, JSON.stringify(store, null, 2), "utf8");
		await rename(tmpFile, SETTINGS_FILE);
	}
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
			typeof next.includeDefiBrla === "boolean" ? next.includeDefiBrla : current.includeDefiBrla,
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

		alertsEnabled: typeof next.alertsEnabled === "boolean" ? next.alertsEnabled : current.alertsEnabled,
		alertTracks: next.alertTracks !== undefined ? { ...current.alertTracks, ...next.alertTracks } : current.alertTracks,
		minSpreadA: typeof next.minSpreadA === "number" && next.minSpreadA > 0 ? next.minSpreadA : current.minSpreadA,
		minSpreadB: typeof next.minSpreadB === "number" && next.minSpreadB > 0 ? next.minSpreadB : current.minSpreadB,
		minSpreadC: typeof next.minSpreadC === "number" && next.minSpreadC > 0 ? next.minSpreadC : current.minSpreadC,
		minSpreadD: typeof next.minSpreadD === "number" && next.minSpreadD > 0 ? next.minSpreadD : current.minSpreadD,
		simCapital: typeof next.simCapital === "number" && next.simCapital > 0 ? next.simCapital : current.simCapital,
		silentNight: typeof next.silentNight === "boolean" ? next.silentNight : current.silentNight,
		silentStart: typeof next.silentStart === "string" ? next.silentStart : current.silentStart,
		silentEnd: typeof next.silentEnd === "string" ? next.silentEnd : current.silentEnd,
		pendingSpreadTrack:
			next.pendingSpreadTrack === "a" || next.pendingSpreadTrack === "b" || next.pendingSpreadTrack === "c"
				? next.pendingSpreadTrack
				: "pendingSpreadTrack" in next
					? null
					: current.pendingSpreadTrack,
		pendingAuthStep:
			next.pendingAuthStep === "cadastro_username" ||
			next.pendingAuthStep === "cadastro_password" ||
			next.pendingAuthStep === "login_username" ||
			next.pendingAuthStep === "login_password"
				? next.pendingAuthStep
				: "pendingAuthStep" in next
					? null
					: current.pendingAuthStep,
		pendingAuthUsername:
			typeof next.pendingAuthUsername === "string" || next.pendingAuthUsername === null
				? (next.pendingAuthUsername ?? null)
				: current.pendingAuthUsername,
		suppressDispatchUntilAuth:
			typeof next.suppressDispatchUntilAuth === "boolean"
				? next.suppressDispatchUntilAuth
				: current.suppressDispatchUntilAuth,
		pausedUntil: "pausedUntil" in next ? (next.pausedUntil ?? null) : current.pausedUntil,
		alertsThisHour: typeof next.alertsThisHour === "number" ? next.alertsThisHour : current.alertsThisHour,
		alertsHourReset: typeof next.alertsHourReset === "number" ? next.alertsHourReset : current.alertsHourReset,
		alertsToday: typeof next.alertsToday === "number" ? next.alertsToday : current.alertsToday,
		alertsDayReset: typeof next.alertsDayReset === "number" ? next.alertsDayReset : current.alertsDayReset,
		lastAlertA: "lastAlertA" in next ? (next.lastAlertA ?? null) : current.lastAlertA,
		lastAlertB: next.lastAlertB !== undefined ? { ...current.lastAlertB, ...next.lastAlertB } : current.lastAlertB,
		lastAlertC: "lastAlertC" in next ? (next.lastAlertC ?? null) : current.lastAlertC,
		lastAlertD: "lastAlertD" in next ? (next.lastAlertD ?? null) : current.lastAlertD,
		lastDispatchAtA: "lastDispatchAtA" in next ? (next.lastDispatchAtA ?? null) : current.lastDispatchAtA,
		lastDispatchAtB: "lastDispatchAtB" in next ? (next.lastDispatchAtB ?? null) : current.lastDispatchAtB,
		lastDispatchAtC: "lastDispatchAtC" in next ? (next.lastDispatchAtC ?? null) : current.lastDispatchAtC,
		lastDispatchAtD: "lastDispatchAtD" in next ? (next.lastDispatchAtD ?? null) : current.lastDispatchAtD,
		lastDispatchStatusA:
			next.lastDispatchStatusA === "sent" || next.lastDispatchStatusA === "skipped" || next.lastDispatchStatusA === "failed"
				? next.lastDispatchStatusA
				: "lastDispatchStatusA" in next
					? null
					: current.lastDispatchStatusA,
		lastDispatchStatusB:
			next.lastDispatchStatusB === "sent" || next.lastDispatchStatusB === "skipped" || next.lastDispatchStatusB === "failed"
				? next.lastDispatchStatusB
				: "lastDispatchStatusB" in next
					? null
					: current.lastDispatchStatusB,
		lastDispatchStatusC:
			next.lastDispatchStatusC === "sent" || next.lastDispatchStatusC === "skipped" || next.lastDispatchStatusC === "failed"
				? next.lastDispatchStatusC
				: "lastDispatchStatusC" in next
					? null
					: current.lastDispatchStatusC,
		lastDispatchStatusD:
			next.lastDispatchStatusD === "sent" || next.lastDispatchStatusD === "skipped" || next.lastDispatchStatusD === "failed"
				? next.lastDispatchStatusD
				: "lastDispatchStatusD" in next
					? null
					: current.lastDispatchStatusD,
		lastDispatchReasonA:
			typeof next.lastDispatchReasonA === "string" || next.lastDispatchReasonA === null
				? (next.lastDispatchReasonA ?? null)
				: current.lastDispatchReasonA,
		lastDispatchReasonB:
			typeof next.lastDispatchReasonB === "string" || next.lastDispatchReasonB === null
				? (next.lastDispatchReasonB ?? null)
				: current.lastDispatchReasonB,
		lastDispatchReasonC:
			typeof next.lastDispatchReasonC === "string" || next.lastDispatchReasonC === null
				? (next.lastDispatchReasonC ?? null)
				: current.lastDispatchReasonC,
		lastDispatchReasonD:
			typeof next.lastDispatchReasonD === "string" || next.lastDispatchReasonD === null
				? (next.lastDispatchReasonD ?? null)
				: current.lastDispatchReasonD,
		lastCronAt: "lastCronAt" in next ? (next.lastCronAt ?? null) : current.lastCronAt,
		plan: next.plan === "free" || next.plan === "pro" || next.plan === "admin" ? next.plan : current.plan,
		planActive: typeof next.planActive === "boolean" ? next.planActive : current.planActive,
		planExpiresAt: "planExpiresAt" in next ? (next.planExpiresAt ?? null) : current.planExpiresAt,
		trialUsed: typeof next.trialUsed === "boolean" ? next.trialUsed : current.trialUsed,
		planStartedAt: "planStartedAt" in next ? (next.planStartedAt ?? null) : current.planStartedAt,
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

const TZ = "America/Sao_Paulo";
const MAX_ALERTS_PER_HOUR = 10;
export const COOLDOWN_A_MS = 10 * 60 * 1000;    // 10 min
export const COOLDOWN_B_MS = 15 * 60 * 1000;    // 15 min
export const COOLDOWN_C_MS = 10 * 60 * 1000;    // 10 min
export const COOLDOWN_D_MS = 10 * 60 * 1000;    // 10 min
export const PAUSE_SPAM_MS = 30 * 60 * 1000;    // auto-pause 30min when limit hit
export const PAUSE_FOREVER = -1;

function isInSilentHours(settings: TelegramUserSettings): boolean {
	if (!settings.silentNight) return false;
	const now = new Date();
	const spStr = new Intl.DateTimeFormat("pt-BR", {
		timeZone: TZ,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(now);
	const [h, m] = spStr.split(":").map(Number);
	const nowMins = h * 60 + m;
	const [sh, sm] = settings.silentStart.split(":").map(Number);
	const [eh, em] = settings.silentEnd.split(":").map(Number);
	const startMins = sh * 60 + sm;
	const endMins = eh * 60 + em;
	if (startMins > endMins) {
		return nowMins >= startMins || nowMins < endMins;
	}
	return nowMins >= startMins && nowMins < endMins;
}

export type AlertCheckResult =
	| { allowed: false; reason: "disabled" | "paused" | "plan" | "silent" | "cooldown" | "ratelimit" | "nospread" }
	| { allowed: true; updates: Partial<TelegramUserSettings>; autoSpamPause?: boolean };

export function checkAlertEligibility(
	settings: TelegramUserSettings,
	track: "a" | "b" | "c" | "d",
	scannerKey?: string
): AlertCheckResult {
	const now = Date.now();

	if (!settings.alertsEnabled) return { allowed: false, reason: "disabled" };

	if (settings.pausedUntil === PAUSE_FOREVER || (settings.pausedUntil !== null && settings.pausedUntil > now)) {
		return { allowed: false, reason: "paused" };
	}

	// Plan check via central temAcesso
	const planInfo = { plan: settings.plan, planActive: settings.planActive, planExpiresAt: settings.planExpiresAt, trialUsed: settings.trialUsed };
	const funcMap = { a: "trilha_a", b: "trilha_b", c: "trilha_c", d: "trilha_b" } as const;
	if (!temAcesso(planInfo, funcMap[track])) return { allowed: false, reason: "plan" };

	// Track enabled check
	if (!settings.alertTracks[track]) return { allowed: false, reason: "disabled" };

	// Silent night
	if (isInSilentHours(settings)) return { allowed: false, reason: "silent" };

	// Cooldown per track
	if (track === "a") {
		if (settings.lastAlertA !== null && now - settings.lastAlertA < COOLDOWN_A_MS) {
			return { allowed: false, reason: "cooldown" };
		}
	} else if (track === "c") {
		if (settings.lastAlertC !== null && now - settings.lastAlertC < COOLDOWN_C_MS) {
			return { allowed: false, reason: "cooldown" };
		}
	} else if (track === "d") {
		if (settings.lastAlertD !== null && now - settings.lastAlertD < COOLDOWN_D_MS) {
			return { allowed: false, reason: "cooldown" };
		}
	} else if (track === "b" && scannerKey) {
		const last = settings.lastAlertB[scannerKey] ?? null;
		if (last !== null && now - last < COOLDOWN_B_MS) {
			return { allowed: false, reason: "cooldown" };
		}
	}

	// Hourly rate limit
	let alertsThisHour = settings.alertsThisHour;
	let alertsHourReset = settings.alertsHourReset;
	if (now > alertsHourReset + 3_600_000) {
		alertsThisHour = 0;
		alertsHourReset = now;
	}
	if (alertsThisHour >= MAX_ALERTS_PER_HOUR) {
		return { allowed: false, reason: "ratelimit" };
	}

	// Daily limit via central plans module
	let alertsToday = settings.alertsToday;
	let alertsDayReset = settings.alertsDayReset;
	if (now > alertsDayReset + 86_400_000) {
		alertsToday = 0;
		alertsDayReset = now;
	}
	const dailyLimit = maxAlertasPerDay(planInfo);
	if (Number.isFinite(dailyLimit) && alertsToday >= dailyLimit) {
		return { allowed: false, reason: "plan" };
	}

	// Build update patch
	const updates: Partial<TelegramUserSettings> = {
		alertsThisHour: alertsThisHour + 1,
		alertsHourReset,
		alertsToday: alertsToday + 1,
		alertsDayReset,
	};
	const autoSpamPause = alertsThisHour + 1 >= MAX_ALERTS_PER_HOUR;

	if (track === "a") {
		updates.lastAlertA = now;
	} else if (track === "c") {
		updates.lastAlertC = now;
	} else if (track === "d") {
		updates.lastAlertD = now;
	} else if (track === "b" && scannerKey) {
		updates.lastAlertB = { [scannerKey]: now };
	}

	return { allowed: true, updates, autoSpamPause };
}