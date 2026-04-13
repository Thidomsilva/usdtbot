"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { P2PArbitrageOpportunity, P2PArbitrageResponse } from "@/lib/types";

const REFRESH_SECONDS = 20;

function brl(value: number): string {
  return `R$ ${value.toFixed(4)}`;
}

function compactBrl(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`;
  return `R$ ${value.toFixed(0)}`;
}

export default function P2PArbitragePage() {
  const [data, setData] = useState<P2PArbitrageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [amountBrl, setAmountBrl] = useState("1000");
  const [safetyBuffer, setSafetyBuffer] = useState("0.20");
  const [methodFilter, setMethodFilter] = useState("all");

  const amountNum = useMemo(() => {
    const parsed = Number(amountBrl);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }, [amountBrl]);

  const safetyNum = useMemo(() => {
    const parsed = Number(safetyBuffer);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.2;
  }, [safetyBuffer]);

  async function load() {
    try {
      const qs = new URLSearchParams({
        amount_brl: String(amountNum),
        safety_buffer_pct: String(safetyNum),
      });
      const res = await fetch(`/api/p2p-arbitrage?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as P2PArbitrageResponse;
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
  }, [amountNum, safetyNum]);

  const paymentMethods = useMemo(() => {
    if (!data) return [] as string[];
    const unique = new Set<string>();
    for (const offer of [...data.buy_offers, ...data.sell_offers]) {
      for (const method of offer.payment_methods) unique.add(method);
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [] as Array<P2PArbitrageOpportunity & { est_net_profit_brl: number; est_net_profit_pct: number }>;

    return data.opportunities
      .filter((op) => {
        if (methodFilter === "all") return true;
        return op.buy_payment_methods.includes(methodFilter) || op.sell_payment_methods.includes(methodFilter);
      })
      .map((op) => {
        const amountValid = amountNum >= op.executable_min_brl && amountNum <= op.executable_max_brl;
        if (!amountValid) {
          return {
            ...op,
            est_net_profit_brl: Number.NaN,
            est_net_profit_pct: Number.NaN,
          };
        }

        const usdt = amountNum / op.buy_price_brl;
        const gross = usdt * op.sell_price_brl - amountNum;
        const bufferCost = amountNum * (safetyNum / 100);
        const net = gross - bufferCost;

        return {
          ...op,
          est_net_profit_brl: net,
          est_net_profit_pct: (net / amountNum) * 100,
        };
      })
      .sort((a, b) => {
        const aNet = Number.isFinite(a.est_net_profit_brl) ? a.est_net_profit_brl : Number.NEGATIVE_INFINITY;
        const bNet = Number.isFinite(b.est_net_profit_brl) ? b.est_net_profit_brl : Number.NEGATIVE_INFINITY;
        return bNet - aNet;
      });
  }, [data, methodFilter, amountNum, safetyNum]);

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
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Arbitragem P2P</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento de oportunidades BRL/USDT no mercado P2P com simulacao de spread liquido.
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Valor da simulacao (BRL)</span>
              <input
                value={amountBrl}
                onChange={(e) => setAmountBrl(e.target.value)}
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
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Margem de seguranca (%)</span>
              <input
                value={safetyBuffer}
                onChange={(e) => setSafetyBuffer(e.target.value)}
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
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Filtro de pagamento</span>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
              >
                <option value="all">Todos</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {data
              ? `${data.summary.api_connected ? "API conectada" : "API desconectada"} · ${data.summary.buy_count} ofertas compra · ${data.summary.sell_count} ofertas venda · ${data.summary.profitable_count} cenarios com spread positivo · melhor spread bruto ${data.summary.gross_spread_pct.toFixed(3)}%`
              : "Carregando oportunidades..."}
            {" · "}proxima atualizacao em {countdown}s
          </div>
        </section>

        {data && (
          <section
            style={{
              marginTop: 12,
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: 16,
              padding: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Top ofertas de compra (voce compra USDT)</div>
              <div style={{ display: "grid", gap: 8 }}>
                {data.buy_offers.slice(0, 5).map((offer) => (
                  <div key={`buy-${offer.id}`} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{brl(offer.price_brl)}</strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{offer.available_usdt.toFixed(2)} USDT</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{offer.seller_name}</div>
                  </div>
                ))}
                {data.buy_offers.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>Sem anuncios de compra.</div>}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Top ofertas de venda (voce vende USDT)</div>
              <div style={{ display: "grid", gap: 8 }}>
                {data.sell_offers.slice(0, 5).map((offer) => (
                  <div key={`sell-${offer.id}`} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{brl(offer.price_brl)}</strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{offer.available_usdt.toFixed(2)} USDT</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{offer.seller_name}</div>
                  </div>
                ))}
                {data.sell_offers.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>Sem anuncios de venda.</div>}
              </div>
            </div>
          </section>
        )}

        {data?.warning && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 12,
              border: "1px solid #f59e0b55",
              background: "rgba(245, 158, 11, 0.08)",
              color: "#f59e0b",
              padding: "10px 12px",
              fontSize: 13,
            }}
          >
            {data.warning}
          </div>
        )}

        <section
          style={{
            marginTop: 16,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid var(--card-border)", fontSize: 12, color: "var(--muted)" }}>
            Ranking de oportunidades por lucro liquido estimado
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>#</th>
                  <th style={{ padding: "10px 12px" }}>Compra</th>
                  <th style={{ padding: "10px 12px" }}>Venda</th>
                  <th style={{ padding: "10px 12px" }}>Spread bruto</th>
                  <th style={{ padding: "10px 12px" }}>Liquidez</th>
                  <th style={{ padding: "10px 12px" }}>Faixa executavel</th>
                  <th style={{ padding: "10px 12px" }}>Lucro liquido</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>
                      Nenhuma oportunidade para o filtro atual.
                    </td>
                  </tr>
                ) : (
                  filtered.map((op, i) => {
                    const validAmount = Number.isFinite(op.est_net_profit_brl);
                    const netColor = !validAmount
                      ? "var(--muted)"
                      : op.est_net_profit_brl >= 0
                        ? "var(--ok)"
                        : "var(--error)";
                    const spreadColor = op.gross_spread_pct >= 0 ? "var(--ok)" : "var(--error)";

                    return (
                      <tr key={`${op.buy_offer_id}-${op.sell_offer_id}`} style={{ borderTop: "1px solid var(--card-border)" }}>
                        <td style={{ padding: "10px 12px", fontSize: 13 }}>{i + 1}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700 }}>{brl(op.buy_price_brl)}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{op.buy_seller}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{op.buy_payment_methods.join(", ") || "-"}</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700 }}>{brl(op.sell_price_brl)}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{op.sell_buyer}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{op.sell_payment_methods.join(", ") || "-"}</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: spreadColor }}>
                          {op.gross_spread_pct.toFixed(3)}%<div style={{ fontSize: 11, color: "var(--muted)" }}>R$ {op.gross_spread_brl_per_1000.toFixed(2)} / 1000</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 13 }}>{op.est_liquidity_usdt.toFixed(2)} USDT</td>
                        <td style={{ padding: "10px 12px", fontSize: 13 }}>
                          {op.executable
                            ? `${compactBrl(op.executable_min_brl)} ate ${compactBrl(op.executable_max_brl)}`
                            : "Sem intersecao de limites"}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: netColor }}>
                          {validAmount
                            ? `${op.est_net_profit_brl >= 0 ? "+" : ""}R$ ${op.est_net_profit_brl.toFixed(2)} (${op.est_net_profit_pct.toFixed(2)}%)`
                            : "Valor fora da faixa executavel"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {data?.error && (
          <div style={{ marginTop: 12, color: "var(--error)", fontSize: 13 }}>
            Falha ao carregar P2P: {data.error}
          </div>
        )}
      </div>
    </main>
  );
}