"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ExchangeQuote = {
  exchange: string;
  label: string;
  pix: boolean;
  accepts_brl: boolean;
  estimated: boolean;
  status: "ok" | "not_listed";
  price_brl?: number;
  volume_24h_brl?: number;
  change_24h?: number;
};

type TokenRow = {
  id: string;
  symbol: string;
  team: string;
  tier: 1 | 2 | 3 | 4;
  status: "ok" | "error";
  avg_price_brl?: number | null;
  exchanges?: ExchangeQuote[];
  best_arb?: {
    buy_exchange: string;
    buy_exchange_label: string;
    sell_exchange: string;
    sell_exchange_label: string;
    spread_pct: number;
  } | null;
  error?: string;
};

type FanTokensResponse = {
  timestamp: string;
  summary: {
    total_tokens: number;
    with_arbitrage: number;
    above_1_pct: number;
    above_3_pct: number;
    usd_brl: number;
    best_opportunity: {
      symbol: string;
      team: string;
      spread_pct: number;
      buy: string;
      sell: string;
    } | null;
  } | null;
  tokens: TokenRow[];
  error?: string;
};

const REFRESH_SECONDS = 45;

function tierColor(tier: 1 | 2 | 3 | 4) {
  if (tier === 1) return "#f59e0b";
  if (tier === 2) return "#2563eb";
  if (tier === 3) return "#059669";
  return "#dc2626";
}

export default function FanTokensPage() {
  const [data, setData] = useState<FanTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      const res = await fetch("/api/fan-tokens", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FanTokensResponse;
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
  }, []);

  const sorted = useMemo(() => {
    if (!data?.tokens) return [];
    return [...data.tokens].sort((a, b) => {
      const sa = a.best_arb?.spread_pct ?? -1;
      const sb = b.best_arb?.spread_pct ?? -1;
      return sb - sa;
    });
  }, [data]);

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1160, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>Voltar para USDT/BRL</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Fan Tokens Pulse</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento de oportunidades entre corretoras com atualizacao a cada 45 segundos.
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

        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          {data?.summary
            ? `${data.summary.with_arbitrage} tokens com arbitragem em ${data.summary.total_tokens} monitorados`
            : "Carregando dados..."}
          {" · "}proxima atualizacao em {countdown}s
        </div>

        {data?.summary && (
          <section
            style={{
              marginTop: 18,
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: 16,
              padding: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>USD/BRL</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.summary.usd_brl.toFixed(4)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Spread acima de 1%</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.summary.above_1_pct}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Spread acima de 3%</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.summary.above_3_pct}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Melhor oportunidade</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {data.summary.best_opportunity
                  ? `${data.summary.best_opportunity.symbol} (${data.summary.best_opportunity.spread_pct.toFixed(2)}%)`
                  : "Sem oportunidade agora"}
              </div>
            </div>
          </section>
        )}

        <section
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 12,
          }}
        >
          {sorted.map((token) => {
            const isOpen = !!expanded[token.id];
            return (
              <article
                key={token.id}
                style={{
                  border: "1px solid var(--card-border)",
                  borderRadius: 14,
                  background: "var(--card)",
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [token.id]: !isOpen }))}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: 14,
                    border: "none",
                    background: "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong>{token.symbol}</strong>
                        <span
                          style={{
                            fontSize: 11,
                            borderRadius: 999,
                            padding: "2px 8px",
                            border: `1px solid ${tierColor(token.tier)}`,
                            color: tierColor(token.tier),
                          }}
                        >
                          Tier {token.tier}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{token.team}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800 }}>
                        {token.avg_price_brl ? `R$ ${token.avg_price_brl.toFixed(4)}` : "Sem dados"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {token.best_arb ? `Spread ${token.best_arb.spread_pct.toFixed(2)}%` : "Sem arbitragem"}
                      </div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--card-border)", padding: 12 }}>
                    {token.best_arb && (
                      <div style={{ fontSize: 12, marginBottom: 10, color: "var(--muted)" }}>
                        Comprar em <strong>{token.best_arb.buy_exchange_label}</strong> e vender em <strong>{token.best_arb.sell_exchange_label}</strong>.
                      </div>
                    )}

                    <div style={{ display: "grid", gap: 8 }}>
                      {(token.exchanges ?? []).map((ex) => (
                        <div
                          key={`${token.id}-${ex.exchange}`}
                          style={{
                            border: "1px solid var(--card-border)",
                            borderRadius: 10,
                            padding: "8px 10px",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{ex.label}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
                              {ex.pix ? "PIX" : "Sem PIX"} · {ex.accepts_brl ? "BRL direto" : "USDT convertido"}
                              {ex.estimated ? " · estimado" : ""}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            {ex.status === "ok" ? (
                              <>
                                <div style={{ fontWeight: 700 }}>R$ {(ex.price_brl ?? 0).toFixed(4)}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                  {(ex.change_24h ?? 0) >= 0 ? "+" : ""}
                                  {(ex.change_24h ?? 0).toFixed(2)}% · Vol R$ {((ex.volume_24h_brl ?? 0) / 1000).toFixed(1)}K
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>Nao listado</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {data?.error && (
          <div style={{ marginTop: 16, color: "var(--error)", fontSize: 13 }}>
            Falha ao carregar dados de fan tokens: {data.error}
          </div>
        )}
      </div>
    </main>
  );
}
