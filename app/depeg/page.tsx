"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DepegRow = {
  id: string;
  label: string;
  symbol: string;
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
    } | null;
  };
  warning?: string;
  error?: string;
};

const REFRESH_SECONDS = 20;

const DEFAULT_MONITORED_PAIRS: Array<Pick<DepegRow, "id" | "label" | "symbol" | "peg_reference">> = [
  { id: "fdusd-usdt", label: "FDUSD x USDT", symbol: "FDUSDUSDT", peg_reference: "USD (1:1)" },
  { id: "tusd-usdt", label: "TUSD x USDT", symbol: "TUSDUSDT", peg_reference: "USD (1:1)" },
  { id: "eurc-usdt", label: "EURC x USDT", symbol: "EURCUSDT", peg_reference: "EUR/USD via Frankfurter" },
  { id: "eurs-usdt", label: "EURS x USDT", symbol: "EURSUSDT", peg_reference: "EUR/USD via Frankfurter" },
  { id: "brz-usdt", label: "BRZ x USDT", symbol: "BRZUSDT", peg_reference: "BRL/USD via Frankfurter" },
  { id: "brl1-usdt", label: "BRL1 x USDT", symbol: "BRL1USDT", peg_reference: "BRL/USD via Frankfurter" },
];

function pct(value: number | null): string {
  if (value === null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function price(value: number | null): string {
  if (value === null) return "--";
  return `USDT ${value.toFixed(6)}`;
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

export default function DepegArbitragePage() {
  const [data, setData] = useState<DepegResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [thresholdInput, setThresholdInput] = useState("0.35");

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
        status: "unavailable",
        analyzed_on: "Binance Spot BookTicker",
        peg_reference: pair.peg_reference,
        market_price: null,
        market_price_brl: null,
        bid_price: null,
        ask_price: null,
        orderbook_spread_pct: null,
        ideal_price: pair.peg_reference === "USD (1:1)" ? 1 : null,
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
      status: "unavailable" as const,
      analyzed_on: "Binance Spot BookTicker",
      peg_reference: pair.peg_reference,
      market_price: null,
      market_price_brl: null,
      bid_price: null,
      ask_price: null,
      orderbook_spread_pct: null,
      ideal_price: pair.peg_reference === "USD (1:1)" ? 1 : null,
      ideal_price_brl: null,
      depeg_pct: null,
      asymmetry_pct: null,
      direction: "below_peg" as const,
      severity: "low" as const,
      signal: "watch" as const,
      notes: "Par monitorado, sem dados retornados neste ciclo.",
    }));
  }, [data]);

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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
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
                <th style={{ padding: "10px 8px" }}>Sinal</th>
              </tr>
            </thead>
            <tbody>
              {rowsToRender.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid var(--card-border)",
                    fontSize: 13,
                    background:
                      row.status === "ok" && row.asymmetry_pct !== null && row.asymmetry_pct >= activeThresholdPct
                        ? "rgba(245, 158, 11, 0.07)"
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
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.peg_reference}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{price(row.market_price)}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 12 }}>{brl(row.market_price_brl)}</td>
                  <td style={{ padding: "10px 8px" }}>{price(row.ideal_price)}</td>
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
                  <td style={{ padding: "10px 8px" }}>
                    {row.status === "ok" ? (
                      <span
                        style={{
                          border: `1px solid ${severityColor(row.severity)}`,
                          color: severityColor(row.severity),
                          borderRadius: 999,
                          padding: "2px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {row.signal.toUpperCase()}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Sem cotacao</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!data || rowsToRender.length === 0) && (
                <tr>
                  <td colSpan={11} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
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
