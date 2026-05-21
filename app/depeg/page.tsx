"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QuoteAsset = "USDT" | "USDC" | "DAI" | "BRLA" | "BRL1" | "BRZ";

type DepegRow = {
  id: string;
  label: string;
  symbol: string;
  quote_asset: QuoteAsset;
  status: "ok" | "unavailable";
  analyzed_on: string;
  peg_reference: string;
  market_price: number | null;
  market_price_brl: number | null;
  bid_price: number | null;
  ask_price: number | null;
  orderbook_spread_pct: number | null;
  ideal_price: number | null;
  ideal_price_brl: number | null;
  depeg_pct: number | null;
  asymmetry_pct: number | null;
  direction: "above_peg" | "below_peg";
  severity: "low" | "medium" | "high";
  signal: "watch" | "opportunity" | "stress";
  notes: string;
};

type DepegResponse = {
  timestamp: string;
  source: string;
  threshold_pct: number;
  usd_brl: number | null;
  monitored_rows: DepegRow[];
  opportunities: DepegRow[];
  summary: {
    monitored_pairs: number;
    above_threshold: number;
    max_asymmetry_pct: number;
    best_opportunity: {
      id: string;
      label: string;
      depeg_pct: number;
      asymmetry_pct: number;
      direction: "above_peg" | "below_peg";
      signal: "watch" | "opportunity" | "stress";
      net_margin_pct: number | null;
    } | null;
  };
  warning?: string;
  error?: string;
};

const REFRESH_SECONDS = 20;
const DEFAULT_ESTIMATED_FEE_PCT = 0.15;
const BRL_STABLE_FEE_PCT = 0.1;

type DirectionMode = "all" | "buy_discount" | "sell_premium";
type RepegPotential = "high" | "medium" | "low";

const DEFAULT_MONITORED_PAIRS: Array<Pick<DepegRow, "id" | "label" | "symbol" | "quote_asset" | "peg_reference"> & { ideal_price: number | null }> = [
  { id: "usdt-usdc", label: "USDT x USDC", symbol: "USDTUSDC", quote_asset: "USDC", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "usdt-dai", label: "USDT x DAI", symbol: "USDTDAI", quote_asset: "DAI", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "usdc-usdt", label: "USDC x USDT", symbol: "USDCUSDT", quote_asset: "USDT", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "usdc-dai", label: "USDC x DAI", symbol: "USDCDAI", quote_asset: "DAI", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "dai-usdt", label: "DAI x USDT", symbol: "DAIUSDT", quote_asset: "USDT", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "dai-usdc", label: "DAI x USDC", symbol: "DAIUSDC", quote_asset: "USDC", peg_reference: "USD stablecoin (1:1)", ideal_price: 1 },
  { id: "brla-brl1", label: "BRLA x BRL1", symbol: "BRLABRL1", quote_asset: "BRL1", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
  { id: "brla-brz", label: "BRLA x BRZ", symbol: "BRLABRZ", quote_asset: "BRZ", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
  { id: "brz-brla", label: "BRZ x BRLA", symbol: "BRZBRLA", quote_asset: "BRLA", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
  { id: "brz-brl1", label: "BRZ x BRL1", symbol: "BRZBRL1", quote_asset: "BRL1", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
  { id: "brl1-brz", label: "BRL1 x BRZ", symbol: "BRL1BRZ", quote_asset: "BRZ", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
  { id: "brl1-brla", label: "BRL1 x BRLA", symbol: "BRL1BRLA", quote_asset: "BRLA", peg_reference: "BRL stablecoin (1:1)", ideal_price: 1 },
];

function isBrlStableQuote(quoteAsset: QuoteAsset): boolean {
  return quoteAsset === "BRLA" || quoteAsset === "BRL1" || quoteAsset === "BRZ";
}

function pct(value: number | null): string {
  if (value === null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function price(value: number | null, quoteAsset: DepegRow["quote_asset"]): string {
  if (value === null) return "--";
  return `${quoteAsset} ${value.toFixed(6)}`;
}

function brl(value: number | null): string {
  if (value === null) return "--";
  return `R$ ${value.toFixed(6)}`;
}

function severityColor(level: DepegRow["severity"]): string {
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  return "#22c55e";
}

function unavailableSignal(notes: string): string {
  const normalized = notes.toLowerCase();
  if (normalized.includes("mercado nao listado")) {
    return "Mercado nao listado";
  }
  if (normalized.includes("sem bid/ask valido")) {
    return "Mercado inativo";
  }
  if (normalized.includes("regiao atual") || normalized.includes("restricted location")) {
    return "Bloqueio regional";
  }
  if (normalized.includes("timeout")) {
    return "Timeout";
  }
  return "Sem cotacao";
}

function getEstimatedFeePct(row: DepegRow): number {
  return isBrlStableQuote(row.quote_asset) ? BRL_STABLE_FEE_PCT : DEFAULT_ESTIMATED_FEE_PCT;
}

function getNetMarginPct(row: DepegRow): number | null {
  if (row.depeg_pct === null || row.orderbook_spread_pct === null) return null;
  return Math.abs(row.depeg_pct) - row.orderbook_spread_pct - getEstimatedFeePct(row);
}

function hasExecutableOrderbookSource(source: string): boolean {
  return (
    source.includes("Binance Spot BookTicker") ||
    source.includes("Gate Spot Ticker") ||
    source.includes("KuCoin Spot Level1") ||
    source.includes("OKX Spot Ticker") ||
    source.includes("CoinEx Spot Ticker") ||
    source.includes("Bybit Spot Ticker") ||
    source.includes("HTX Spot Ticker") ||
    source.includes("Kraken Spot Ticker") ||
    source.includes("Coinbase Spot Ticker")
  );
}

function getRepegPotential(row: DepegRow): RepegPotential {
  if (row.id.startsWith("usdt-") || row.id.startsWith("usdc-") || row.id.startsWith("dai-")) return "high";
  if (row.id === "brz-brla" || row.id === "brla-brl1" || row.id === "brl1-brla") return "high";
  return "medium";
}

function repegPotentialLabel(level: RepegPotential): string {
  if (level === "high") return "ALTO";
  if (level === "medium") return "MEDIO";
  return "BAIXO";
}

function repegPotentialColor(level: RepegPotential): string {
  if (level === "high") return "#22c55e";
  if (level === "medium") return "#f59e0b";
  return "#ef4444";
}

function getExchangeLinks(symbol: string): Array<{ label: string; url: string }> {
  const links: Array<{ label: string; url: string }> = [];
  
  // Extrai base e quote para os pares monitorados.
  const match = symbol.match(/^(.+?)(USDT|USDC|DAI|BRLA|BRL1|BRZ)$/);
  const base = match?.[1] || symbol;
  const quote = match?.[2] || "USDT";
  
  // Binance - formato: FDUSDUSDT
  links.push({ 
    label: "Binance", 
    url: `https://www.binance.com/trade/${symbol}` 
  });
  
  // Gate.io - formato: FDUSD_USDT
  links.push({ 
    label: "Gate.io", 
    url: `https://www.gate.io/trade/${base}_${quote}` 
  });
  
  // KuCoin - formato: FDUSD-USDT
  links.push({ 
    label: "KuCoin", 
    url: `https://www.kucoin.com/trade/${base}-${quote}` 
  });
  
  // OKX - formato: fdusd-usdt
  links.push({ 
    label: "OKX", 
    url: `https://www.okx.com/trade-spot/${base.toLowerCase()}-${quote.toLowerCase()}` 
  });
  
  // Bybit - formato: FDUSDUSDT
  links.push({ 
    label: "Bybit", 
    url: `https://www.bybit.com/trade/spot/${symbol}` 
  });
  
  // Kraken - formato: FDUSD/USD ou FDUSD/BRL
  const krakenQuote = quote === "BRLA" || quote === "BRL1" || quote === "BRZ" ? "BRL" : quote;
  links.push({ 
    label: "Kraken", 
    url: `https://www.kraken.com/prices/${base}/{krakenQuote}`.replace("{krakenQuote}", krakenQuote) 
  });
  
  return links;
}

function actionSignal(row: DepegRow, activeThresholdPct: number): { label: string; color: string } {
  if (row.depeg_pct === null) return { label: "SEM DADO", color: "var(--muted)" };
  if (!hasExecutableOrderbookSource(row.analyzed_on)) return { label: "INDICATIVO", color: "#f59e0b" };
  if (row.depeg_pct > 0) return { label: "IGNORAR", color: "#ef4444" };

  const asymmetry = row.asymmetry_pct ?? 0;
  if (asymmetry >= activeThresholdPct) return { label: "COMPRA", color: "#22c55e" };
  return { label: "AGUARDAR", color: "#f59e0b" };
}

export default function DepegArbitragePage() {
  const [data, setData] = useState<DepegResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [thresholdInput, setThresholdInput] = useState("0.35");
  const [directionMode, setDirectionMode] = useState<DirectionMode>("buy_discount");

  const thresholdNum = useMemo(() => {
    const parsed = Number(thresholdInput.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.35;
  }, [thresholdInput]);

  async function load() {
    try {
      const qs = new URLSearchParams({ min_depeg_pct: String(thresholdNum) });
      const res = await fetch(`/api/depeg-arbitrage?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DepegResponse;
      setData(json);
    } catch (err) {
      const fallbackRows: DepegRow[] = DEFAULT_MONITORED_PAIRS.map((pair) => ({
        id: pair.id,
        label: pair.label,
        symbol: pair.symbol,
        quote_asset: pair.quote_asset,
        status: "unavailable",
        analyzed_on: "Binance Spot BookTicker",
        peg_reference: pair.peg_reference,
        market_price: null,
        market_price_brl: null,
        bid_price: null,
        ask_price: null,
        orderbook_spread_pct: null,
        ideal_price: pair.ideal_price,
        ideal_price_brl: null,
        depeg_pct: null,
        asymmetry_pct: null,
        direction: "below_peg",
        severity: "low",
        signal: "watch",
        notes: "Par monitorado, sem dados retornados neste ciclo.",
      }));

      setData({
        timestamp: new Date().toISOString(),
        source: "frontend-fallback",
        threshold_pct: thresholdNum,
        usd_brl: null,
        monitored_rows: fallbackRows,
        opportunities: [],
        summary: {
          monitored_pairs: fallbackRows.length,
          above_threshold: 0,
          max_asymmetry_pct: 0,
          best_opportunity: null,
        },
        error: `Falha ao carregar API de de-peg: ${String(err)}`,
        warning: "Exibindo pares monitorados sem cotacao neste ciclo.",
      });
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }

  useEffect(() => {
    load();
    const refreshTimer = setInterval(load, REFRESH_SECONDS * 1000);
    const countdownTimer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
  }, [thresholdNum]);

  const rowsToRender = useMemo(() => {
    if (!data) return [] as DepegRow[];

    if (Array.isArray(data.monitored_rows) && data.monitored_rows.length > 0) {
      return data.monitored_rows;
    }

    if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
      return data.opportunities;
    }

    return DEFAULT_MONITORED_PAIRS.map((pair) => ({
      id: pair.id,
      label: pair.label,
      symbol: pair.symbol,
      quote_asset: pair.quote_asset,
      status: "unavailable" as const,
      analyzed_on: "Binance Spot BookTicker",
      peg_reference: pair.peg_reference,
      market_price: null,
      market_price_brl: null,
      bid_price: null,
      ask_price: null,
      orderbook_spread_pct: null,
      ideal_price: pair.ideal_price,
      ideal_price_brl: null,
      depeg_pct: null,
      asymmetry_pct: null,
      direction: "below_peg" as const,
      severity: "low" as const,
      signal: "watch" as const,
      notes: "Par monitorado, sem dados retornados neste ciclo.",
    }));
  }, [data]);

  const filteredRows = useMemo(() => {
    return rowsToRender.filter((row) => {
      if (directionMode === "all") return true;

      if (directionMode === "buy_discount") {
        return row.status === "ok" && row.depeg_pct !== null && row.depeg_pct < 0;
      }

      return row.status === "ok" && row.depeg_pct !== null && row.depeg_pct > 0;
    });
  }, [directionMode, rowsToRender]);

  const rankedRows = useMemo(() => {
    const rows = [...filteredRows];
    rows.sort((a, b) => {
      const aNet = getNetMarginPct(a);
      const bNet = getNetMarginPct(b);
      if (aNet === null && bNet === null) return a.label.localeCompare(b.label);
      if (aNet === null) return 1;
      if (bNet === null) return -1;
      if (bNet !== aNet) return bNet - aNet;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }, [filteredRows]);

  const activeThresholdPct = data?.threshold_pct ?? thresholdNum;

  const monitoredCount = data ? Math.max(data.summary.monitored_pairs, rowsToRender.length) : 0;

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 8, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT/BRL</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Arbitragem Geral</Link>
              <Link href="/spot-futures" style={{ textDecoration: "none", color: "var(--muted)" }}>Spot x Futuro</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Arbitragem de Descolamento (De-peg)</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento de assimetria de paridade entre stablecoins pareadas e seu valor teorico (USD, EUR ou BRL).
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        <section
          style={{
            marginTop: 18,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Limiar minimo de descolamento (%)</span>
              <input
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                inputMode="decimal"
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
              />
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Direcao</span>
              <div style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: 10, overflow: "hidden", width: "fit-content" }}>
                {[
                  { value: "all", label: "Todas" },
                  { value: "buy_discount", label: "Compra (desconto)" },
                  { value: "sell_premium", label: "Venda (premium)" },
                ].map((mode) => {
                  const active = directionMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() => setDirectionMode(mode.value as DirectionMode)}
                      style={{
                        border: "none",
                        borderRight: mode.value === "sell_premium" ? "none" : "1px solid var(--card-border)",
                        padding: "10px 12px",
                        background: active ? "rgba(14, 165, 233, 0.18)" : "rgba(255,255,255,0.04)",
                        color: active ? "var(--text)" : "var(--muted)",
                        fontWeight: active ? 700 : 500,
                        cursor: "pointer",
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Margem liquida est. = |Descolamento| - Book spread - Taxa estimada (0.15% em pares USD-stable, 0.10% em pares BRL-stable).
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data
              ? `${monitoredCount} pares monitorados · ${data.summary.above_threshold} acima do limiar · max assimetria ${data.summary.max_asymmetry_pct.toFixed(4)}%`
              : "Carregando monitoramento de de-peg..."}
            <span>· proxima atualizacao em {countdown}s</span>
          </div>

          {data?.usd_brl && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Referencia cambial: 1 USD = R$ {data.usd_brl.toFixed(4)}
            </div>
          )}

          {data && data.summary.above_threshold === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Sem oportunidade no limiar atual, mas os precos em tempo real continuam sendo exibidos para todos os pares monitorados.
            </div>
          )}

          {data?.warning && <div style={{ fontSize: 12, color: "#f59e0b" }}>Aviso: {data.warning}</div>}
          {data?.error && <div style={{ fontSize: 12, color: "#ef4444" }}>Erro: {data.error}</div>}
        </section>

        <section
          style={{
            marginTop: 12,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 12,
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 8px" }}>Par</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Onde analisado</th>
                <th style={{ padding: "10px 8px" }}>Mercado (mid)</th>
                <th style={{ padding: "10px 8px" }}>Mercado (BRL)</th>
                <th style={{ padding: "10px 8px" }}>Paridade ideal</th>
                <th style={{ padding: "10px 8px" }}>Paridade ideal (BRL)</th>
                <th style={{ padding: "10px 8px" }}>Descolamento</th>
                <th style={{ padding: "10px 8px" }}>Assimetria</th>
                <th style={{ padding: "10px 8px" }}>Book spread</th>
                <th style={{ padding: "10px 8px" }}>Margem liquida est.</th>
                <th style={{ padding: "10px 8px" }}>Potencial repareamento</th>
                <th style={{ padding: "10px 8px" }}>Sinal</th>
                <th style={{ padding: "10px 8px" }}>Comprar</th>
              </tr>
            </thead>
            <tbody>
              {rankedRows.map((row) => {
                const netMarginPct = getNetMarginPct(row);
                const repegLevel = getRepegPotential(row);
                const signal = actionSignal(row, activeThresholdPct);

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid var(--card-border)",
                      fontSize: 13,
                      background:
                        row.status === "ok" && netMarginPct !== null && netMarginPct > 0
                          ? "rgba(34, 197, 94, 0.08)"
                          : "transparent",
                    }}
                  >
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.symbol}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        border: `1px solid ${row.status === "ok" ? "#22c55e" : "#ef4444"}`,
                        color: row.status === "ok" ? "#22c55e" : "#ef4444",
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {row.status === "ok" ? "ATIVO" : "INDISPONIVEL"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div>{row.analyzed_on}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {row.peg_reference}
                      {!hasExecutableOrderbookSource(row.analyzed_on) ? " · fonte indicativa" : ""}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{price(row.market_price, row.quote_asset)}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{brl(row.market_price_brl)}</td>
                  <td style={{ padding: "10px 8px" }}>{price(row.ideal_price, row.quote_asset)}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{brl(row.ideal_price_brl)}</td>
                  <td
                    style={{
                      padding: "10px 8px",
                      color: row.depeg_pct === null ? "var(--muted)" : row.depeg_pct >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: 700,
                    }}
                  >
                    {pct(row.depeg_pct)}
                  </td>
                  <td
                    style={{
                      padding: "10px 8px",
                      color: row.asymmetry_pct === null ? "var(--muted)" : severityColor(row.severity),
                      fontWeight: 700,
                    }}
                  >
                    {row.asymmetry_pct === null ? "--" : `${row.asymmetry_pct.toFixed(4)}%`}
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)" }}>
                    {row.orderbook_spread_pct === null ? "--" : `${row.orderbook_spread_pct.toFixed(4)}%`}
                  </td>
                  <td
                    style={{
                      padding: "10px 8px",
                      color: netMarginPct === null ? "var(--muted)" : netMarginPct >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: 700,
                    }}
                  >
                    {netMarginPct === null ? "--" : `${netMarginPct.toFixed(4)}%`}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {row.status === "ok" ? (
                      <span
                        style={{
                          border: `1px solid ${repegPotentialColor(repegLevel)}`,
                          color: repegPotentialColor(repegLevel),
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {repegPotentialLabel(repegLevel)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>--</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {row.status === "ok" ? (
                      <span
                        style={{
                          border: `1px solid ${signal.color}`,
                          color: signal.color,
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {signal.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }} title={row.notes}>
                        {unavailableSignal(row.notes)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {signal.label === "COMPRA" ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {getExchangeLinks(row.symbol).map((link) => (
                          <a
                            key={link.label}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              fontSize: 11,
                              border: "1px solid var(--card-border)",
                              borderRadius: 6,
                              color: "var(--link, #0ea5e9)",
                              textDecoration: "none",
                              transition: "all 0.2s",
                              backgroundColor: "rgba(14, 165, 233, 0.08)",
                            }}
                            onMouseEnter={(e) => {
                              (e.target as HTMLAnchorElement).style.backgroundColor = "rgba(14, 165, 233, 0.16)";
                              (e.target as HTMLAnchorElement).style.borderColor = "#0ea5e9";
                            }}
                            onMouseLeave={(e) => {
                              (e.target as HTMLAnchorElement).style.backgroundColor = "rgba(14, 165, 233, 0.08)";
                              (e.target as HTMLAnchorElement).style.borderColor = "var(--card-border)";
                            }}
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>--</span>
                    )}
                  </td>
                  </tr>
                );
              })}
              {(!data || rankedRows.length === 0) && (
                <tr>
                  <td colSpan={14} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
                    Nenhum par disponivel neste momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
