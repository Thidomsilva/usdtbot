"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OpportunityQuality = "inviavel" | "apertada" | "executavel";

type HistoryPoint = {
  timestamp: string;
  buyExchangeLabel: string;
  sellExchangeLabel: string;
  grossSpreadPct: number;
  netSpreadPct: number;
  quality: OpportunityQuality;
};

type ExchangeQuote = {
  exchange: string;
  label: string;
  pix: boolean;
  accepts_brl: boolean;
  estimated: boolean;
  status: "ok" | "not_listed";
  price_brl?: number;
  bid_price_brl?: number;
  ask_price_brl?: number;
  original_currency?: "BRL" | "USDT";
  original_price?: number;
  original_bid_price?: number;
  original_ask_price?: number;
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
  avg_original_price?: number | null;
  avg_original_currency?: "BRL" | "USDT" | null;
  exchanges?: ExchangeQuote[];
  best_arb?: {
    buy_exchange: string;
    buy_exchange_label: string;
    sell_exchange: string;
    sell_exchange_label: string;
    buy_price_brl: number;
    sell_price_brl: number;
    spread_pct: number;
    net_spread_pct: number;
    buy_fee_pct: number;
    sell_fee_pct: number;
    quality: OpportunityQuality;
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
type DisplayMode = "brl" | "original";
const ALERT_THRESHOLD_DEFAULT = "0.8";
const HISTORY_LIMIT = 24;

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

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function formatPriceWithCurrency(price: number, currency: "BRL" | "USDT") {
  if (currency === "BRL") return `R$ ${formatPrice(price)}`;
  return `${formatPrice(price)} ${currency}`;
}

function getExchangeDisplayValue(
  exchange: ExchangeQuote,
  kind: "reference" | "buy" | "sell",
  mode: DisplayMode
): { price?: number; currency?: "BRL" | "USDT" } {
  if (mode === "original") {
    if (kind === "reference") return { price: exchange.original_price, currency: exchange.original_currency };
    if (kind === "buy") return { price: exchange.original_ask_price, currency: exchange.original_currency };
    return { price: exchange.original_bid_price, currency: exchange.original_currency };
  }

  if (kind === "reference") return { price: exchange.price_brl, currency: "BRL" };
  if (kind === "buy") return { price: exchange.ask_price_brl, currency: "BRL" };
  return { price: exchange.bid_price_brl, currency: "BRL" };
}

function qualityMeta(quality: OpportunityQuality) {
  if (quality === "executavel") return { label: "Executavel", color: "#16a34a", background: "rgba(22,163,74,0.14)" };
  if (quality === "apertada") return { label: "Apertada", color: "#ca8a04", background: "rgba(202,138,4,0.14)" };
  return { label: "Inviavel", color: "#dc2626", background: "rgba(220,38,38,0.14)" };
}

export default function FanTokensPage() {
  const [data, setData] = useState<FanTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [displayMode, setDisplayMode] = useState<DisplayMode>("brl");
  const [alertThreshold, setAlertThreshold] = useState(ALERT_THRESHOLD_DEFAULT);
  const [historyByToken, setHistoryByToken] = useState<Record<string, HistoryPoint[]>>({});

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
    const saved = localStorage.getItem("fan-tokens-display-mode");
    if (saved === "brl" || saved === "original") {
      setDisplayMode(saved);
    }

    const savedThreshold = localStorage.getItem("fan-tokens-alert-threshold");
    if (savedThreshold) {
      setAlertThreshold(savedThreshold);
    }

    const savedHistory = localStorage.getItem("fan-tokens-history");
    if (savedHistory) {
      try {
        setHistoryByToken(JSON.parse(savedHistory) as Record<string, HistoryPoint[]>);
      } catch {
        localStorage.removeItem("fan-tokens-history");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("fan-tokens-display-mode", displayMode);
  }, [displayMode]);

  useEffect(() => {
    localStorage.setItem("fan-tokens-alert-threshold", alertThreshold);
  }, [alertThreshold]);

  useEffect(() => {
    localStorage.setItem("fan-tokens-history", JSON.stringify(historyByToken));
  }, [historyByToken]);

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
      .filter((t) => (t.best_arb?.net_spread_pct ?? 0) > 0)
      .sort((a, b) => (b.best_arb?.net_spread_pct ?? 0) - (a.best_arb?.net_spread_pct ?? 0))
      .slice(0, 6);
  }, [data]);

  const alertThresholdNum = useMemo(() => {
    const value = Number(alertThreshold.replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : 0.8;
  }, [alertThreshold]);

  const activeAlerts = useMemo(() => {
    if (!data?.tokens) return [] as TokenRow[];
    return data.tokens
      .filter((token) => (token.best_arb?.net_spread_pct ?? Number.NEGATIVE_INFINITY) >= alertThresholdNum)
      .sort((a, b) => (b.best_arb?.net_spread_pct ?? 0) - (a.best_arb?.net_spread_pct ?? 0));
  }, [data, alertThresholdNum]);

  useEffect(() => {
    if (!data?.tokens?.length) return;

    setHistoryByToken((current) => {
      const next = { ...current };

      for (const token of data.tokens) {
        const best = token.best_arb;
        if (!best) continue;

        const previous = next[token.id] ?? [];
        const point: HistoryPoint = {
          timestamp: data.timestamp,
          buyExchangeLabel: best.buy_exchange_label,
          sellExchangeLabel: best.sell_exchange_label,
          grossSpreadPct: best.spread_pct,
          netSpreadPct: best.net_spread_pct,
          quality: best.quality,
        };

        const last = previous[previous.length - 1];
        if (
          last &&
          last.buyExchangeLabel === point.buyExchangeLabel &&
          last.sellExchangeLabel === point.sellExchangeLabel &&
          Math.abs(last.netSpreadPct - point.netSpreadPct) < 0.0001
        ) {
          continue;
        }

        next[token.id] = [...previous, point].slice(-HISTORY_LIMIT);
      }

      return next;
    });
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
              <Link href="/spot-futures" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir Spot x Futuro</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Arbitragem Geral</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento de oportunidades entre corretoras — criptos, altcoins e fan tokens. Atualizado a cada 45s.
            </p>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>
              O spread usa ask para compra e bid para venda no livro. O preço de referência continua sendo exibido separado.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: "1px solid var(--card-border)", borderRadius: 12, overflow: "hidden", background: "var(--card)" }}>
              <button
                onClick={() => setDisplayMode("brl")}
                style={{
                  border: "none",
                  padding: "10px 12px",
                  background: displayMode === "brl" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Exibir em BRL
              </button>
              <button
                onClick={() => setDisplayMode("original")}
                style={{
                  border: "none",
                  borderLeft: "1px solid var(--card-border)",
                  padding: "10px 12px",
                  background: displayMode === "original" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Exibir em moeda original
              </button>
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
          </div>
        </header>

        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          {data?.summary
            ? `${data.summary.with_arbitrage} ativos com arbitragem em ${data.summary.total_tokens} monitorados`
            : "Carregando dados..."}
          {" · "}proxima atualizacao em {countdown}s
        </div>

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Alertas de spread liquido</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Dispara visualmente quando a oportunidade fica acima do limite configurado.
              </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>
              Limite liquido (%)
              <input
                type="number"
                min="0"
                step="0.1"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                style={{
                  marginLeft: 8,
                  width: 92,
                  border: "1px solid var(--card-border)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </label>
          </div>

          {activeAlerts.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Nenhum ativo acima de {alertThresholdNum.toFixed(2)}% liquido no momento.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {activeAlerts.slice(0, 8).map((token) => {
                const quality = qualityMeta(token.best_arb?.quality ?? "inviavel");
                return (
                  <button
                    key={`alert-${token.id}`}
                    onClick={() => openTokenCard(token.id)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${quality.color}55`,
                      borderRadius: 12,
                      padding: "10px 12px",
                      background: quality.background,
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{token.symbol}</strong>
                      <span style={{ fontSize: 11, color: quality.color, fontWeight: 700 }}>{quality.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      {token.best_arb?.buy_exchange_label} → {token.best_arb?.sell_exchange_label}
                    </div>
                    <div style={{ fontSize: 13, color: quality.color, fontWeight: 800, marginTop: 6 }}>
                      Liquido {token.best_arb?.net_spread_pct.toFixed(2)}%
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

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
                        {token.best_arb ? `${token.best_arb.net_spread_pct.toFixed(2)}% liquido` : "0.00%"}
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
                  const spread = token.best_arb?.net_spread_pct ?? 0;
                  const quality = qualityMeta(token.best_arb?.quality ?? "inviavel");
                  const spreadColor = quality.color;
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
                              {token.best_arb && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    background: quality.background,
                                    color: quality.color,
                                    fontWeight: 700,
                                  }}
                                >
                                  {quality.label}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{token.team}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 800, fontSize: 12, color: "var(--muted)" }}>
                              {displayMode === "brl" ? "Referencia" : "Moeda original"}
                            </div>
                            <div style={{ fontWeight: 800 }}>
                              {displayMode === "brl"
                                ? hasValue(token.avg_price_brl)
                                  ? formatPriceWithCurrency(token.avg_price_brl, "BRL")
                                  : "Sem dados"
                                : hasValue(token.avg_original_price) && token.avg_original_currency
                                  ? formatPriceWithCurrency(token.avg_original_price, token.avg_original_currency)
                                  : "Misto"}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: token.best_arb ? 700 : 400, color: spreadColor }}>
                              {token.best_arb ? `▲ ${token.best_arb.net_spread_pct.toFixed(2)}% liquido` : "Sem arbitragem"}
                            </div>
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div style={{ borderTop: "1px solid var(--card-border)", padding: 12 }}>
                          {token.best_arb && (() => {
                            const buyExchange = (token.exchanges ?? []).find((ex) => ex.exchange === token.best_arb?.buy_exchange);
                            const sellExchange = (token.exchanges ?? []).find((ex) => ex.exchange === token.best_arb?.sell_exchange);
                            const buyValue = buyExchange ? getExchangeDisplayValue(buyExchange, "buy", displayMode) : { price: token.best_arb.buy_price_brl, currency: "BRL" as const };
                            const sellValue = sellExchange ? getExchangeDisplayValue(sellExchange, "sell", displayMode) : { price: token.best_arb.sell_price_brl, currency: "BRL" as const };

                            return (
                              <div style={{ fontSize: 12, marginBottom: 10, color: "var(--muted)" }}>
                                Comprar no ask de <strong>{token.best_arb.buy_exchange_label}</strong> por {buyValue.price && buyValue.currency ? formatPriceWithCurrency(buyValue.price, buyValue.currency) : "-"} e vender no bid de{" "}
                                <strong>{token.best_arb.sell_exchange_label}</strong> por {sellValue.price && sellValue.currency ? formatPriceWithCurrency(sellValue.price, sellValue.currency) : "-"}.
                                {" "}Bruto {token.best_arb.spread_pct.toFixed(2)}% · Liquido {token.best_arb.net_spread_pct.toFixed(2)}% · Taxas {token.best_arb.buy_fee_pct.toFixed(2)}% + {token.best_arb.sell_fee_pct.toFixed(2)}%.
                              </div>
                            );
                          })()}

                          {(historyByToken[token.id]?.length ?? 0) > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                                Historico local de spread por ativo e rota
                              </div>
                              <div style={{ display: "grid", gap: 6 }}>
                                {[...(historyByToken[token.id] ?? [])].slice(-6).reverse().map((point, index) => {
                                  const historyQuality = qualityMeta(point.quality);
                                  const timeLabel = new Date(point.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                                  return (
                                    <div
                                      key={`${token.id}-history-${index}-${point.timestamp}`}
                                      style={{
                                        border: "1px solid var(--card-border)",
                                        borderRadius: 10,
                                        padding: "8px 10px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <div>
                                        <div style={{ fontSize: 12, fontWeight: 700 }}>{point.buyExchangeLabel} → {point.sellExchangeLabel}</div>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{timeLabel}</div>
                                      </div>
                                      <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 12, color: historyQuality.color, fontWeight: 800 }}>
                                          {point.netSpreadPct.toFixed(2)}% liquido
                                        </div>
                                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Bruto {point.grossSpreadPct.toFixed(2)}% · {historyQuality.label}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div style={{ display: "grid", gap: 8 }}>
                            {(token.exchanges ?? [])
                              .slice()
                              .sort((a, b) => (a.ask_price_brl ?? a.price_brl ?? Number.POSITIVE_INFINITY) - (b.ask_price_brl ?? b.price_brl ?? Number.POSITIVE_INFINITY))
                              .map((ex) => {
                                const refValue = getExchangeDisplayValue(ex, "reference", displayMode);
                                const buyValue = getExchangeDisplayValue(ex, "buy", displayMode);
                                const sellValue = getExchangeDisplayValue(ex, "sell", displayMode);

                                return (
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
                                          <div style={{ fontWeight: 700 }}>
                                            Ref. {refValue.price && refValue.currency ? formatPriceWithCurrency(refValue.price, refValue.currency) : "-"}
                                          </div>
                                          {((buyValue.price ?? 0) > 0 || (sellValue.price ?? 0) > 0) && (
                                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                              Comprar {buyValue.price && buyValue.currency ? formatPriceWithCurrency(buyValue.price, buyValue.currency) : "-"} · Vender {sellValue.price && sellValue.currency ? formatPriceWithCurrency(sellValue.price, sellValue.currency) : "-"}
                                            </div>
                                          )}
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
                                );
                              })}
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
