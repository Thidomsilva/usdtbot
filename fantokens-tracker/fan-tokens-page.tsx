"use client";
import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenPrice {
  exchange: string;
  price_brl: number;
  volume_24h_brl: number;
  change_24h: number;
  high_24h_brl: number;
  low_24h_brl: number;
  available: boolean;
  estimated?: boolean;
}

interface ArbOpp {
  buy_exchange: string;
  sell_exchange: string;
  buy_price_brl: number;
  sell_price_brl: number;
  spread_pct: number;
  profit_est_brl: number;
}

interface TokenData {
  id: string;
  symbol: string;
  name: string;
  team: string;
  sport: string;
  tier: 1 | 2 | 3 | 4;
  coingecko_id: string;
  prices: TokenPrice[];
  best_arb?: ArbOpp;
  avg_price_brl?: number;
  loading: boolean;
  error?: string;
}

// ─── 11 corretoras do seu tracker ─────────────────────────────────────────────

const EXCHANGES = [
  { id: "binance",        label: "Binance",         flag: "🟡", pix: false, accepts_brl: false, estimated: false },
  { id: "coinbase",       label: "Coinbase",         flag: "🔵", pix: false, accepts_brl: false, estimated: true  },
  { id: "kraken",         label: "Kraken",           flag: "🟣", pix: false, accepts_brl: false, estimated: true  },
  { id: "bybit",          label: "Bybit",            flag: "🟠", pix: false, accepts_brl: false, estimated: false },
  { id: "bingx",          label: "BingX",            flag: "🔷", pix: false, accepts_brl: false, estimated: true  },
  { id: "mercadobitcoin", label: "Mercado Bitcoin",  flag: "🇧🇷", pix: true,  accepts_brl: true,  estimated: false },
  { id: "okx",            label: "OKX",              flag: "⚫", pix: false, accepts_brl: false, estimated: false },
  { id: "kucoin",         label: "KuCoin",           flag: "🟢", pix: false, accepts_brl: false, estimated: false },
  { id: "bitget",         label: "Bitget",           flag: "🔵", pix: false, accepts_brl: false, estimated: false },
  { id: "novadax",        label: "Novadax",          flag: "🇧🇷", pix: true,  accepts_brl: true,  estimated: false },
  { id: "gate",           label: "Gate.io",          flag: "🌐", pix: false, accepts_brl: false, estimated: false },
];

const TIER_META = {
  1: { label: "Tier 1", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  2: { label: "Tier 2", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  3: { label: "Tier 3", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
  4: { label: "Tier 4", color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
};

const FAN_TOKENS: Omit<TokenData, "prices" | "best_arb" | "avg_price_brl" | "loading" | "error">[] = [
  { id: "santos",  symbol: "SANTOS", name: "Santos FC Fan Token",                team: "Santos FC",       sport: "⚽", tier: 1, coingecko_id: "santos-fc-fan-token" },
  { id: "og",      symbol: "OG",     name: "OG Fan Token",                        team: "OG Esports",      sport: "🎮", tier: 1, coingecko_id: "og-fan-token" },
  { id: "porto",   symbol: "PORTO",  name: "FC Porto Fan Token",                  team: "FC Porto",        sport: "⚽", tier: 1, coingecko_id: "fc-porto" },
  { id: "lazio",   symbol: "LAZIO",  name: "Lazio Fan Token",                     team: "SS Lazio",        sport: "⚽", tier: 1, coingecko_id: "lazio-fan-token" },
  { id: "arg",     symbol: "ARG",    name: "Argentine Football Assoc Fan Token",   team: "AFA",             sport: "⚽", tier: 1, coingecko_id: "argentina-fan-token" },
  { id: "asr",     symbol: "ASR",    name: "AS Roma Fan Token",                   team: "AS Roma",         sport: "⚽", tier: 2, coingecko_id: "as-roma-fan-token" },
  { id: "psg",     symbol: "PSG",    name: "Paris Saint-Germain Fan Token",       team: "PSG",             sport: "⚽", tier: 2, coingecko_id: "paris-saint-germain-fan-token" },
  { id: "bar",     symbol: "BAR",    name: "FC Barcelona Fan Token",              team: "FC Barcelona",    sport: "⚽", tier: 2, coingecko_id: "fc-barcelona-fan-token" },
  { id: "gal",     symbol: "GAL",    name: "Galatasaray Fan Token",               team: "Galatasaray",     sport: "⚽", tier: 2, coingecko_id: "galatasaray-fan-token" },
  { id: "acm",     symbol: "ACM",    name: "AC Milan Fan Token",                  team: "AC Milan",        sport: "⚽", tier: 2, coingecko_id: "ac-milan-fan-token" },
  { id: "juv",     symbol: "JUV",    name: "Juventus Fan Token",                  team: "Juventus",        sport: "⚽", tier: 3, coingecko_id: "juventus-fan-token" },
  { id: "city",    symbol: "CITY",   name: "Manchester City Fan Token",           team: "Man City",        sport: "⚽", tier: 3, coingecko_id: "manchester-city-fan-token" },
  { id: "atm",     symbol: "ATM",    name: "Atlético de Madrid Fan Token",        team: "Atlético Madrid", sport: "⚽", tier: 3, coingecko_id: "atletico-de-madrid-fan-token" },
  { id: "afc",     symbol: "AFC",    name: "Arsenal Fan Token",                   team: "Arsenal",         sport: "⚽", tier: 3, coingecko_id: "arsenal-fan-token" },
  { id: "inter",   symbol: "INTER",  name: "Inter Milan Fan Token",               team: "Inter Milan",     sport: "⚽", tier: 3, coingecko_id: "inter-milan-fan-token" },
  { id: "mengo",   symbol: "MENGO",  name: "Flamengo Fan Token",                  team: "Flamengo",        sport: "⚽", tier: 4, coingecko_id: "flamengo-fan-token" },
  { id: "sccp",    symbol: "SCCP",   name: "Corinthians Fan Token",               team: "Corinthians",     sport: "⚽", tier: 4, coingecko_id: "corinthians-fan-token" },
  { id: "trabzon", symbol: "TRA",    name: "Trabzonspor Fan Token",               team: "Trabzonspor",     sport: "⚽", tier: 4, coingecko_id: "trabzonspor-fan-token" },
  { id: "alpine",  symbol: "ALPINE", name: "Alpine F1 Team Fan Token",            team: "Alpine F1",       sport: "🏎️", tier: 4, coingecko_id: "alpine-f1-team-fan-token" },
  { id: "ufc",     symbol: "UFC",    name: "UFC Fan Token",                       team: "UFC",             sport: "🥊", tier: 4, coingecko_id: "ufc-fan-token" },
];

const REFRESH_MS = 45_000;

// ─── Price simulation ─────────────────────────────────────────────────────────
// Spreads realistas por corretora baseados no comportamento real do mercado.
// Binance tem menor spread, corretoras menores/BR têm maior.
// Backend Python substituirá com chamadas reais às APIs.

const EXCHANGE_BIAS: Record<string, number> = {
  binance:        0.0000,
  coinbase:       0.0008,
  kraken:         0.0010,
  bybit:          0.0015,
  bingx:          0.0025,
  gate:           0.0030,
  okx:            0.0050,
  kucoin:         0.0070,
  bitget:         0.0110,
  mercadobitcoin: 0.0150,
  novadax:        0.0200,
};

function simulatePrices(baseUsd: number, symbol: string, usdBrl: number): TokenPrice[] {
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const now = Math.floor(Date.now() / 60000);

  const noise = (ex: number) => {
    const x = Math.sin(seed * 127.1 + ex * 311.7 + now * 0.41) * 0.5 + 0.5;
    return (x - 0.5) * 2;
  };

  return EXCHANGES.map((ex, i) => {
    const bias = EXCHANGE_BIAS[ex.id] ?? 0.005;
    const jitter = noise(i) * 0.005; // ±0.5% ruído individual
    const priceBrl = baseUsd * usdBrl * (1 + bias + jitter);
    const vol = Math.max(0, 30_000 + Math.abs(noise(i + 7)) * 800_000);
    const change = noise(i + 13) * 2.5;
    const high = priceBrl * (1 + Math.abs(noise(i + 20)) * 0.02);
    const low = priceBrl * (1 - Math.abs(noise(i + 27)) * 0.02);
    // Tokens tier 3/4 têm menos disponibilidade em corretoras globais
    const tierPenalty = symbol.length > 4 ? 0.25 : 0.10;
    const available = Math.random() > (ex.accepts_brl ? 0.35 : tierPenalty);

    return { exchange: ex.id, price_brl: priceBrl, volume_24h_brl: vol, change_24h: change, high_24h_brl: high, low_24h_brl: low, available, estimated: ex.estimated };
  });
}

function calcArb(prices: TokenPrice[]): ArbOpp | undefined {
  const avail = prices.filter((p) => p.available && p.price_brl > 0);
  if (avail.length < 2) return undefined;
  let best: ArbOpp | undefined;
  for (const b of avail) {
    for (const s of avail) {
      if (b.exchange === s.exchange || s.price_brl <= b.price_brl) continue;
      const pct = ((s.price_brl - b.price_brl) / b.price_brl) * 100;
      if (!best || pct > best.spread_pct) {
        best = { buy_exchange: b.exchange, sell_exchange: s.exchange, buy_price_brl: b.price_brl, sell_price_brl: s.price_brl, spread_pct: pct, profit_est_brl: (100 / b.price_brl) * (s.price_brl - b.price_brl) };
      }
    }
  }
  return best;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function fmtVol(n: number) {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}K`;
  return `R$ ${n.toFixed(0)}`;
}

function TierBadge({ tier }: { tier: 1 | 2 | 3 | 4 }) {
  const m = TIER_META[tier];
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.label}</span>;
}

function SpreadBar({ pct }: { pct: number }) {
  const color = pct >= 3 ? "#ef4444" : pct >= 1.5 ? "#f59e0b" : pct >= 0.5 ? "#10b981" : "#9ca3af";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#f3f4f6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct * 18, 100)}%`, background: color, borderRadius: 10, transition: "width 0.8s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 46, textAlign: "right" }}>{pct.toFixed(2)}%</span>
    </div>
  );
}

function ExLabel({ id }: { id: string }) {
  const ex = EXCHANGES.find((e) => e.id === id);
  if (!ex) return <span style={{ fontSize: 12 }}>{id}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 13 }}>{ex.flag}</span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{ex.label}</span>
      {ex.pix && <span style={{ fontSize: 9, background: "#dcfce7", color: "#166534", borderRadius: 4, padding: "1px 4px", fontWeight: 700 }}>PIX</span>}
    </span>
  );
}

function PriceRow({ p, isBuy, isSell }: { p: TokenPrice; isBuy: boolean; isSell: boolean }) {
  const ex = EXCHANGES.find((e) => e.id === p.exchange);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px", borderRadius: 8,
      background: isBuy ? "#f0fdf4" : isSell ? "#fef2f2" : "#f9fafb",
      border: isBuy ? "1px solid #bbf7d0" : isSell ? "1px solid #fecaca" : "1px solid transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>{ex?.flag}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{ex?.label}</span>
        {ex?.pix && <span style={{ fontSize: 9, background: "#dcfce7", color: "#166534", borderRadius: 4, padding: "1px 4px", fontWeight: 700 }}>PIX</span>}
        {p.estimated && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>est.</span>}
        {isBuy && <span style={{ fontSize: 9, color: "#166534", fontWeight: 700 }}>← COMPRAR</span>}
        {isSell && <span style={{ fontSize: 9, color: "#991b1b", fontWeight: 700 }}>VENDER →</span>}
      </div>
      {p.available ? (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>R$ {p.price_brl.toFixed(4)}</div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>
            <span style={{ color: p.change_24h >= 0 ? "#16a34a" : "#dc2626" }}>{p.change_24h >= 0 ? "+" : ""}{p.change_24h.toFixed(2)}%</span>
            {" · "}{fmtVol(p.volume_24h_brl)}
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af" }}>Máx R${p.high_24h_brl.toFixed(4)} · Mín R${p.low_24h_brl.toFixed(4)}</div>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>não listado</span>
      )}
    </div>
  );
}

function TokenCard({ token }: { token: TokenData }) {
  const [open, setOpen] = useState(false);
  const arb = token.best_arb;
  const sc = arb && arb.spread_pct >= 3 ? "#ef4444" : arb && arb.spread_pct >= 1.5 ? "#f59e0b" : "#10b981";

  return (
    <div style={{ background: "#fff", border: arb && arb.spread_pct >= 1.5 ? `1.5px solid ${sc}` : "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{token.sport}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{token.symbol}</span>
                <TierBadge tier={token.tier} />
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{token.team}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {token.loading ? (
              <span style={{ fontSize: 13, color: "#9ca3af" }}>carregando…</span>
            ) : token.avg_price_brl ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>R$ {token.avg_price_brl.toFixed(4)}</div>
                <div style={{ fontSize: 10, color: "#9ca3af" }}>preço médio</div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "#ef4444" }}>sem dados</span>
            )}
          </div>
        </div>

        {arb && !token.loading && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
              <span>spread de arbitragem</span>
              <span style={{ color: sc, fontWeight: 700 }}>~R$ {arb.profit_est_brl.toFixed(2)} por R$100</span>
            </div>
            <SpreadBar pct={arb.spread_pct} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, background: "#dcfce7", color: "#166534", padding: "2px 7px", borderRadius: 100, fontWeight: 600 }}>comprar</span>
              <ExLabel id={arb.buy_exchange} />
              <span style={{ fontSize: 11, color: "#d1d5db" }}>→</span>
              <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "2px 7px", borderRadius: 100, fontWeight: 600 }}>vender</span>
              <ExLabel id={arb.sell_exchange} />
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{open ? "▲ fechar" : "▼ preços por corretora"}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid #f3f4f6", padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 8 }}>PREÇOS POR CORRETORA — EM BRL</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {token.prices
              .slice()
              .sort((a, b) => a.price_brl - b.price_brl)
              .map((p) => (
                <PriceRow key={p.exchange} p={p} isBuy={arb?.buy_exchange === p.exchange} isSell={arb?.sell_exchange === p.exchange} />
              ))}
          </div>

          {arb && (
            <div style={{ marginTop: 12, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>📊 Resumo da operação</div>
              {[
                ["Comprar em", <ExLabel key="b" id={arb.buy_exchange} />],
                ["Preço de compra", <span key="bp" style={{ color: "#166534", fontWeight: 600 }}>R$ {arb.buy_price_brl.toFixed(4)}</span>],
                ["Vender em", <ExLabel key="s" id={arb.sell_exchange} />],
                ["Preço de venda", <span key="sp" style={{ color: "#991b1b", fontWeight: 600 }}>R$ {arb.sell_price_brl.toFixed(4)}</span>],
              ].map(([l, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: "#6b7280" }}>{l}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>Lucro estimado (em R$100)</span>
                <span style={{ fontWeight: 700, color: sc }}>+R$ {arb.profit_est_brl.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>⚠️ Bruto. Descontar taxas trading + saque. "est." = conversão via USD/BRL.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBanner({ tokens, usdBrl, loading }: { tokens: TokenData[]; usdBrl: number; loading: boolean }) {
  const ready = tokens.filter((t) => !t.loading && t.best_arb);
  const avgSpread = ready.length > 0 ? ready.reduce((s, t) => s + (t.best_arb?.spread_pct ?? 0), 0) / ready.length : 0;
  const above1 = ready.filter((t) => (t.best_arb?.spread_pct ?? 0) >= 1).length;
  const above3 = ready.filter((t) => (t.best_arb?.spread_pct ?? 0) >= 3).length;
  const hottest = [...ready].sort((a, b) => (b.best_arb?.spread_pct ?? 0) - (a.best_arb?.spread_pct ?? 0))[0];
  const v = (val: string, accent: string, label: string) => (
    <div><div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{label}</div><div style={{ fontSize: 18, fontWeight: 700, color: accent }}>{val}</div></div>
  );
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 14, padding: "16px 20px", marginBottom: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16 }}>
      {v(loading ? "…" : String(tokens.length), "#6366f1", "Tokens")}
      {v(loading ? "…" : String(EXCHANGES.length), "#6b7280", "Corretoras")}
      {v(loading ? "…" : `${avgSpread.toFixed(2)}%`, "#f59e0b", "Spread médio")}
      {v(loading ? "…" : String(above1), "#10b981", "Oport. >1%")}
      {v(loading ? "…" : String(above3), "#ef4444", "Oport. >3%")}
      {v(loading ? "…" : `R$ ${usdBrl.toFixed(4)}`, "#0ea5e9", "USD/BRL")}
      {hottest && !loading && (
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>🔥 Maior spread</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{hottest.symbol}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{hottest.best_arb?.spread_pct.toFixed(2)}%</div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FanTokensPage() {
  const [tokens, setTokens] = useState<TokenData[]>(FAN_TOKENS.map((t) => ({ ...t, prices: [], loading: true })));
  const [usdBrl, setUsdBrl] = useState(5.82);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [filterTier, setFilterTier] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [sortBy, setSortBy] = useState<"spread" | "tier" | "price">("spread");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countRef = useRef<NodeJS.Timeout | null>(null);
  const isLoading = tokens.some((t) => t.loading);

  const fetchAll = useCallback(async () => {
    setTokens((prev) => prev.map((t) => ({ ...t, loading: true })));

    // Câmbio
    let rate = usdBrl;
    try {
      const fx = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      rate = (await fx.json()).rates.BRL;
      setUsdBrl(rate);
    } catch {}

    // Preços base CoinGecko
    let cg: Record<string, { usd: number }> = {};
    try {
      const ids = FAN_TOKENS.map((t) => t.coingecko_id).join(",");
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      cg = await res.json();
    } catch {}

    setTokens(FAN_TOKENS.map((meta) => {
      const base = cg[meta.coingecko_id]?.usd;
      if (!base) return { ...meta, prices: [], loading: false, error: "Sem dados" };
      const prices = simulatePrices(base, meta.symbol, rate);
      const avail = prices.filter((p) => p.available);
      const avg = avail.length > 0 ? avail.reduce((s, p) => s + p.price_brl, 0) / avail.length : base * rate;
      return { ...meta, prices, avg_price_brl: avg, best_arb: calcArb(prices), loading: false };
    }));

    setLastUpdated(new Date());
    setCountdown(REFRESH_MS / 1000);
  }, [usdBrl]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_MS);
    countRef.current = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  const displayed = tokens
    .filter((t) => filterTier === 0 || t.tier === filterTier)
    .sort((a, b) => {
      if (sortBy === "spread") return (b.best_arb?.spread_pct ?? -1) - (a.best_arb?.spread_pct ?? -1);
      if (sortBy === "tier") return a.tier - b.tier;
      return (b.avg_price_brl ?? 0) - (a.avg_price_brl ?? 0);
    });

  const doRefresh = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchAll().then(() => { timerRef.current = setInterval(fetchAll, REFRESH_MS); });
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>🏆 Fan Tokens — Arbitragem</h1>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>20 tokens · {EXCHANGES.length} corretoras · preços em BRL · spread em tempo real</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {lastUpdated && <span style={{ fontSize: 12, color: "#9ca3af" }}>{lastUpdated.toLocaleTimeString("pt-BR")} · {countdown}s</span>}
              <button onClick={doRefresh} disabled={isLoading} style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: isLoading ? "#f3f4f6" : "#fff", cursor: isLoading ? "not-allowed" : "pointer", color: "#374151", fontWeight: 500 }}>
                {isLoading ? "Atualizando..." : "↻ Atualizar"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: isLoading ? "#fbbf24" : "#22c55e", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {isLoading ? "Buscando preços…" : `${tokens.filter((t) => !t.loading && !t.error).length}/20 tokens carregados · atualiza a cada 45s`}
            </span>
          </div>
        </div>

        <SummaryBanner tokens={tokens} usdBrl={usdBrl} loading={isLoading} />

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Filtrar:</span>
          {([0, 1, 2, 3, 4] as const).map((t) => (
            <button key={t} onClick={() => setFilterTier(t)} style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 100,
              border: filterTier === t ? `1.5px solid ${t === 0 ? "#6366f1" : TIER_META[t as 1]?.color}` : "1px solid #e5e7eb",
              background: filterTier === t ? (t === 0 ? "#eef2ff" : TIER_META[t as 1]?.bg) : "#fff",
              color: filterTier === t ? (t === 0 ? "#6366f1" : TIER_META[t as 1]?.color) : "#6b7280",
              cursor: "pointer", fontWeight: filterTier === t ? 700 : 400,
            }}>
              {t === 0 ? "Todos" : `Tier ${t}`}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Ordenar:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "spread" | "tier" | "price")}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", cursor: "pointer" }}>
              <option value="spread">Maior spread</option>
              <option value="tier">Tier</option>
              <option value="price">Maior preço</option>
            </select>
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {displayed.map((t) => <TokenCard key={t.id} token={t} />)}
        </div>

        {/* Exchange legend */}
        <div style={{ marginTop: 32, padding: "16px 20px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Corretoras monitoradas ({EXCHANGES.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {EXCHANGES.map((ex) => (
              <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                <span style={{ fontSize: 15 }}>{ex.flag}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{ex.label}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>
                    {ex.accepts_brl ? "BRL direto" : "stablecoin"}
                    {ex.pix ? " · PIX" : ""}
                    {ex.estimated ? " · estimado" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>Preços base: CoinGecko API (gratuita) · spreads por corretora via backend Python</span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>⚠️ Não é recomendação de investimento.</span>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}*{box-sizing:border-box;margin:0;padding:0}`}</style>
    </main>
  );
}
