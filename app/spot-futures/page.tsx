"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SpotFuturesOpportunity = {
  symbol: string;
  venue: "binance" | "bybit";
  venue_label: string;
  spot_bid: number;
  spot_ask: number;
  futures_bid: number;
  futures_ask: number;
  funding_rate_pct_8h: number;
  basis_pct: number;
  gross_entry_pct: number;
  fee_roundtrip_pct: number;
  slippage_buffer_pct: number;
  net_est_pct_8h: number;
};

type SpotFuturesResponse = {
  timestamp: string;
  opportunities: SpotFuturesOpportunity[];
  summary: {
    symbols_monitored: number;
    venues: string[];
    profitable_count: number;
    best_opportunity: SpotFuturesOpportunity | null;
    slippage_buffer_pct: number;
  };
  warning?: string;
  error?: string;
};

const REFRESH_SECONDS = 20;

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(4)}%`;
}

function price(v: number): string {
  return `USDT ${v.toFixed(6)}`;
}

export default function SpotFuturesPage() {
  const [data, setData] = useState<SpotFuturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [slippageBuffer, setSlippageBuffer] = useState("0.10");
  const [symbolFilter, setSymbolFilter] = useState("all");

  const slippageNum = useMemo(() => {
    const parsed = Number(slippageBuffer);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.1;
  }, [slippageBuffer]);

  async function load() {
    try {
      const qs = new URLSearchParams({
        slippage_buffer_pct: String(slippageNum),
      });
      const res = await fetch(`/api/spot-futures-arbitrage?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SpotFuturesResponse;
      setData(json);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }

  useEffect(() => {
    load();
    const t1 = setInterval(load, REFRESH_SECONDS * 1000);
    const t2 = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [slippageNum]);

  const symbols = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.opportunities.map((o) => o.symbol))].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const opportunities = useMemo(() => {
    if (!data) return [] as SpotFuturesOpportunity[];
    return data.opportunities.filter((o) => (symbolFilter === "all" ? true : o.symbol === symbolFilter));
  }, [data, symbolFilter]);

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 8, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT/BRL</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Arbitragem Geral</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Spot x Futuro</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Cash-and-carry em tempo real: buy spot + short perp, com funding e custos no calculo.
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Buffer de slippage (%)</span>
              <input
                value={slippageBuffer}
                onChange={(e) => setSlippageBuffer(e.target.value)}
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

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Filtro por ativo</span>
              <select
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
              >
                <option value="all">Todos</option>
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {data
              ? `${data.summary.venues.join(" + ")} · ${data.summary.symbols_monitored} ativos · ${data.summary.profitable_count} oportunidades liquidas > 0 em 8h`
              : "Carregando oportunidades..."}
            {" · "}proxima atualizacao em {countdown}s
          </div>

          {data?.warning && <div style={{ fontSize: 12, color: "#f59e0b" }}>Aviso: {data.warning}</div>}
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Se uma corretora retornar 403/451, a API dela esta bloqueada para a regiao/IP atual e os calculos seguem com as demais.
          </div>
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
                <th style={{ padding: "10px 8px" }}>Ativo</th>
                <th style={{ padding: "10px 8px" }}>Corretora</th>
                <th style={{ padding: "10px 8px" }}>Spot Ask</th>
                <th style={{ padding: "10px 8px" }}>Future Bid</th>
                <th style={{ padding: "10px 8px" }}>Basis</th>
                <th style={{ padding: "10px 8px" }}>Funding 8h</th>
                <th style={{ padding: "10px 8px" }}>Taxas RT</th>
                <th style={{ padding: "10px 8px" }}>Liq. 8h</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={`${o.symbol}-${o.venue}`} style={{ borderBottom: "1px solid var(--card-border)", fontSize: 13 }}>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>{o.symbol}</td>
                  <td style={{ padding: "10px 8px" }}>{o.venue_label}</td>
                  <td style={{ padding: "10px 8px" }}>{price(o.spot_ask)}</td>
                  <td style={{ padding: "10px 8px" }}>{price(o.futures_bid)}</td>
                  <td style={{ padding: "10px 8px", color: o.basis_pct >= 0 ? "#22c55e" : "#ef4444" }}>{pct(o.basis_pct)}</td>
                  <td style={{ padding: "10px 8px", color: o.funding_rate_pct_8h >= 0 ? "#22c55e" : "#ef4444" }}>{pct(o.funding_rate_pct_8h)}</td>
                  <td style={{ padding: "10px 8px", color: "#f59e0b" }}>{pct(-o.fee_roundtrip_pct)}</td>
                  <td style={{ padding: "10px 8px", color: o.net_est_pct_8h >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{pct(o.net_est_pct_8h)}</td>
                </tr>
              ))}
              {opportunities.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
                    Sem oportunidades para o filtro atual.
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
