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
  category?: "fan_token" | "major" | "altcoin";
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

const CATEGORY_GROUPS: {
  key: "major" | "altcoin" | "fan_token";
  label: string;
  subtitle: string;
  color: string;
}[] = [
  {
    key: "major",
    label: "Grandes do Mercado",
    subtitle: "Maior volume global (bilhões/dia) — spreads frequentes entre corretoras",
    color: "#7c3aed",
  },
  {
    key: "altcoin",
    label: "Altcoins de Alta Liquidez",
    subtitle: "Alta liquidez e boas janelas de arbitragem",
    color: "#0891b2",
  },
  {
    key: "fan_token",
    label: "Fan Tokens",
    subtitle: "Tokens de times esportivos e organizações de esports",
    color: "#f59e0b",
  },
];

function tierColor(tier: 1 | 2 | 3 | 4) {
  if (tier === 1) return "#f59e0b";
  if (tier === 2) return "#2563eb";
  if (tier === 3) return "#059669";
  return "#dc2626";
}

function getCategoryBadge(token: TokenRow): { label: string; color: string } {
  if (token.category === "major") return { label: "Major", color: "#7c3aed" };
  if (token.category === "altcoin") return { label: "Altcoin", color: "#0891b2" };
  return { label: `Tier ${token.tier}`, color: tierColor(token.tier) };
}

function formatPrice(price: number): string {
  if (price === 0) return "0";
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  if (price < 1000) return price.toFixed(2);
  return price.toFixed(0);
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

  const groups = useMemo(() => {
    const empty = { major: [] as TokenRow[], altcoin: [] as TokenRow[], fan_token: [] as TokenRow[] };
    if (!data?.tokens) return empty;
    const sortFn = (a: TokenRow, b: TokenRow) =>
      (b.best_arb?.spread_pct ?? -1) - (a.best_arb?.spread_pct ?? -1);
    return {
      major: data.tokens.filter((t) => t.category === "major").sort(sortFn),
      altcoin: data.tokens.filter((t) => t.category === "altcoin").sort(sortFn),
      fan_token: data.tokens.filter((t) => t.category === "fan_token" || !t.category).sort(sortFn),
    };
  }, [data]);

  const spreadChampions = useMemo(() => {
    if (!data?.tokens) return [] as TokenRow[];
    return data.tokens
      .filter((t) => (t.best_arb?.spread_pct ?? 0) > 0)
      .sort((a, b) => (b.best_arb?.spread_pct ?? 0) - (a.best_arb?.spread_pct ?? 0))
      .slice(0, 6);
  }, [data]);

  function openTokenCard(tokenId: string) {
    setExpanded((s) => ({ ...s, [tokenId]: true }));
    setTimeout(() => {
      const el = document.getElementById(`token-card-${tokenId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1160, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>Voltar para USDT/BRL</Link>
              <Link href="/p2p" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir Arbitragem P2P</Link>
              <Link href="/spot-futures" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir Spot x Futuro</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Arbitragem Geral</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento de oportunidades entre corretoras — criptos, altcoins e fan tokens. Atualizado a cada 45s.
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
            ? `${data.summary.with_arbitrage} ativos com arbitragem em ${data.summary.total_tokens} monitorados`
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
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Campeoes de spread (clique para abrir)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {spreadChampions.length > 0 ? (
                  spreadChampions.map((token, index) => (
                    <button
                      key={`champion-${token.id}`}
                      onClick={() => openTokenCard(token.id)}
                      style={{
                        textAlign: "left",
                        border: "1px solid var(--card-border)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.03)",
                        color: "var(--text)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>#{index + 1}</div>
                      <div style={{ fontWeight: 800 }}>{token.symbol}</div>
                      <div style={{ fontSize: 12, color: "#16a34a" }}>
                        {token.best_arb ? `${token.best_arb.spread_pct.toFixed(2)}%` : "0.00%"}
                      </div>
                    </button>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Sem oportunidades no momento.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {CATEGORY_GROUPS.map(({ key, label, subtitle, color }) => {
          const tokens = groups[key];
          if (tokens.length === 0) return null;
          return (
            <div key={key} style={{ marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span
                  style={{
                    width: 4,
                    height: 22,
                    background: color,
                    borderRadius: 2,
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{subtitle}</div>
                </div>
              </div>
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                  gap: 12,
                }}
              >
                {tokens.map((token) => {
                  const isOpen = !!expanded[token.id];
                  const spread = token.best_arb?.spread_pct ?? 0;
                  const spreadColor = spread >= 3 ? "#16a34a" : spread >= 1 ? "#ca8a04" : "var(--muted)";
                  return (
                    <article
                      key={token.id}
                      id={`token-card-${token.id}`}
                      style={{
                        border: spread >= 1 ? `1px solid ${spreadColor}44` : "1px solid var(--card-border)",
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
                                  border: `1px solid ${getCategoryBadge(token).color}`,
                                  color: getCategoryBadge(token).color,
                                }}
                              >
                                {getCategoryBadge(token).label}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{token.team}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800 }}>
                              {token.avg_price_brl ? `R$ ${formatPrice(token.avg_price_brl)}` : "Sem dados"}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: token.best_arb ? 700 : 400, color: spreadColor }}>
                              {token.best_arb ? `▲ ${token.best_arb.spread_pct.toFixed(2)}%` : "Sem arbitragem"}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div style={{ borderTop: "1px solid var(--card-border)", padding: 12 }}>
                          {token.best_arb && (
                            <div style={{ fontSize: 12, marginBottom: 10, color: "var(--muted)" }}>
                              Comprar em <strong>{token.best_arb.buy_exchange_label}</strong> e vender em{" "}
                              <strong>{token.best_arb.sell_exchange_label}</strong>.
                            </div>
                          )}
                          <div style={{ display: "grid", gap: 8 }}>
                            {(token.exchanges ?? [])
                              .slice()
                              .sort((a, b) => (b.price_brl ?? 0) - (a.price_brl ?? 0))
                              .map((ex) => (
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
                                      {ex.pix ? "PIX" : "Sem PIX"} ·{" "}
                                      {ex.accepts_brl ? "BRL direto" : "USDT convertido"}
                                      {ex.estimated ? " · estimado" : ""}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    {ex.status === "ok" ? (
                                      <>
                                        <div style={{ fontWeight: 700 }}>R$ {formatPrice(ex.price_brl ?? 0)}</div>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                          {(ex.change_24h ?? 0) >= 0 ? "+" : ""}
                                          {(ex.change_24h ?? 0).toFixed(2)}% · Vol R${" "}
                                          {((ex.volume_24h_brl ?? 0) / 1000).toFixed(1)}K
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
            </div>
          );
        })}

        {data?.error && (
          <div style={{ marginTop: 16, color: "var(--error)", fontSize: 13 }}>
            Falha ao carregar dados de fan tokens: {data.error}
          </div>
        )}
      </div>
    </main>
  );
}
