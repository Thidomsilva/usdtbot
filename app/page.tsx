"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PricesResponse } from "@/lib/types";
import styles from "./ModernGrid.module.css";

const REFRESH_SECONDS = 5;
const ORDER = [
  "binance",
  "bybit",
  "foxbit",
  // "bingx",    // sem par BRL
  // "kraken",   // sem par BRL
  // "coinbase", // sem par BRL
  "bitget",
  "okx",
  "kucoin",
  "novadax",
  "mercadobitcoin",
  "mexc",
];
type ThemeMode = "auto" | "light" | "dark";

const EXCHANGE_META: Record<string, { domain: string }> = {
  binance: { domain: "binance.com" },
  bybit: { domain: "bybit.com" },
  foxbit: { domain: "foxbit.com.br" },
  bingx: { domain: "bingx.com" },
  kraken: { domain: "kraken.com" },
  coinbase: { domain: "coinbase.com" },
  bitget: { domain: "bitget.com" },
  okx: { domain: "okx.com" },
  kucoin: { domain: "kucoin.com" },
  novadax: { domain: "novadax.com" },
  mercadobitcoin: { domain: "mercadobitcoin.com.br" },
  mexc: { domain: "mexc.com" },
};

// Taxas de negociação padrão por exchange (taker fee spot, nível básico sem desconto).
// Ajuste conforme sua conta real — exchanges têm camadas VIP com taxas menores.
const DEFAULT_FEES: Record<string, { buy: number; sell: number }> = {
  binance: { buy: 0.20, sell: 0.20 },
  bybit: { buy: 0.20, sell: 0.20 },
  foxbit: { buy: 0.50, sell: 0.50 },
  bingx: { buy: 0.20, sell: 0.20 },
  kraken: { buy: 0.40, sell: 0.40 },
  coinbase: { buy: 0.60, sell: 0.60 },
  bitget: { buy: 0.20, sell: 0.20 },
  okx: { buy: 0.20, sell: 0.20 },
  kucoin: { buy: 0.20, sell: 0.20 },
  novadax: { buy: 0.35, sell: 0.35 },
  mercadobitcoin: { buy: 0.45, sell: 0.45 },
  mexc: { buy: 0.20, sell: 0.20 },
};

function money(v: number) {
  return `R$ ${v.toFixed(4)}`;
}

function bookMoney(v: number) {
  return `R$ ${v.toFixed(6)}`;
}

function vol(v: number) {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

function getBuyPrice(ex: { ask_price_brl?: number; price_brl?: number }): number {
  return ex.ask_price_brl && ex.ask_price_brl > 0 ? ex.ask_price_brl : ex.price_brl ?? 0;
}

function getSellPrice(ex: { bid_price_brl?: number; price_brl?: number }): number {
  return ex.bid_price_brl && ex.bid_price_brl > 0 ? ex.bid_price_brl : ex.price_brl ?? 0;
}

function getCurrentPrice(ex: { price_brl?: number }): number {
  return ex.price_brl ?? 0;
}

function getBookTradePrice(ex: { ask_price_brl?: number; bid_price_brl?: number; price_brl?: number }): number {
  const ask = ex.ask_price_brl ?? 0;
  const bid = ex.bid_price_brl ?? 0;
  if (ask > 0 && bid > 0) {
    return (ask + bid) / 2;
  }
  if (ask > 0) return ask;
  if (bid > 0) return bid;
  return getCurrentPrice(ex);
}

export default function HomePage() {
  const [data, setData] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [theme, setTheme] = useState<ThemeMode>("auto");
  const [arbAmount, setArbAmount] = useState<string>("1000");
  const [arbBuyEx, setArbBuyEx] = useState<string>("");
  const [arbSellEx, setArbSellEx] = useState<string>("");
  const [customFees, setCustomFees] = useState<Record<string, { buy: number; sell: number }>>(DEFAULT_FEES);
  const [showFees, setShowFees] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/prices", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PricesResponse;
      setData(json);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }

  useEffect(() => {
    const saved = (localStorage.getItem("theme-mode") as ThemeMode | null) ?? "auto";
    setTheme(saved);
  }, []);

  useEffect(() => {
    if (theme === "auto") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("theme-mode");
      return;
    }
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme-mode", theme);
  }, [theme]);

  useEffect(() => {
    load();
    const t1 = setInterval(load, REFRESH_SECONDS * 1000);
    const t2 = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, []);

  const cards = useMemo(() => {
    if (!data) return [];
    const rank = new Map(ORDER.map((key, index) => [key, index]));

    return Object.entries(data.exchanges)
      .filter(([key]) => rank.has(key))
      .map(([key, ex]) => ({ key, ex }))
      .sort((a, b) => {
        const aOk = a.ex.status === "ok";
        const bOk = b.ex.status === "ok";

        if (aOk && bOk) {
          const aPrice = a.ex.price_brl ?? Number.POSITIVE_INFINITY;
          const bPrice = b.ex.price_brl ?? Number.POSITIVE_INFINITY;
          if (aPrice !== bPrice) return aPrice - bPrice;
        }

        if (aOk !== bOk) return aOk ? -1 : 1;

        return (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999);
      });
  }, [data]);

  const okCards = useMemo(
    () => cards.filter(({ ex }) => ex.status === "ok" && ex.price_brl != null),
    [cards]
  );

  const visibleSummary = useMemo(() => {
    if (okCards.length === 0) return null;

    const minCard = okCards.reduce((best, cur) =>
      (cur.ex.price_brl ?? Number.POSITIVE_INFINITY) < (best.ex.price_brl ?? Number.POSITIVE_INFINITY) ? cur : best
    );
    const maxCard = okCards.reduce((best, cur) =>
      (cur.ex.price_brl ?? Number.NEGATIVE_INFINITY) > (best.ex.price_brl ?? Number.NEGATIVE_INFINITY) ? cur : best
    );

    const min = Number((minCard.ex.price_brl ?? 0).toFixed(4));
    const max = Number((maxCard.ex.price_brl ?? 0).toFixed(4));
    const avg = Number(
      (okCards.reduce((acc, { ex }) => acc + (ex.price_brl ?? 0), 0) / okCards.length).toFixed(4)
    );
    const spreadPct = min > 0 ? Number((((max - min) / min) * 100).toFixed(4)) : 0;

    return {
      min,
      max,
      avg,
      spreadPct,
      minExchange: minCard.ex.label,
      maxExchange: maxCard.ex.label,
    };
  }, [okCards]);

  const arbSelectionError = useMemo(() => {
    if (!data) return null;

    if (arbBuyEx) {
      const buy = data.exchanges[arbBuyEx];
      const buyPrice = buy ? getBuyPrice(buy) : 0;
      if (!buy || buy.status !== "ok" || buyPrice <= 0) {
        return `Exchange de compra indisponivel no momento: ${buy?.label ?? arbBuyEx}`;
      }
    }

    if (arbSellEx) {
      const sell = data.exchanges[arbSellEx];
      const sellPrice = sell ? getSellPrice(sell) : 0;
      if (!sell || sell.status !== "ok" || sellPrice <= 0) {
        return `Exchange de venda indisponivel no momento: ${sell?.label ?? arbSellEx}`;
      }
    }

    return null;
  }, [data, arbBuyEx, arbSellEx]);

  const arbResult = useMemo(():
    | null
    | { sameExchange: true }
    | {
        sameExchange: false;
        buyKey: string; sellKey: string;
        buyLabel: string; sellLabel: string;
        buyPrice: number; sellPrice: number;
        buyFee: number; sellFee: number;
        usdtReceived: number; brlReceived: number;
        profit: number; profitPct: number; amount: number;
      } => {
    if (!data || okCards.length < 2) return null;
    const amount = parseFloat(arbAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    // Melhor compra: minimiza custo efetivo = preço / (1 - taxa)
    const autoBuy = [...okCards].reduce((best, cur) => {
      const curEff = getBuyPrice(cur.ex) / (1 - (customFees[cur.key]?.buy ?? 0.10) / 100);
      const bestEff = getBuyPrice(best.ex) / (1 - (customFees[best.key]?.buy ?? 0.10) / 100);
      return curEff < bestEff ? cur : best;
    });

    // Melhor venda: maximiza retorno efetivo = preço * (1 - taxa)
    const autoSell = [...okCards].reduce((best, cur) => {
      const curEff = getSellPrice(cur.ex) * (1 - (customFees[cur.key]?.sell ?? 0.10) / 100);
      const bestEff = getSellPrice(best.ex) * (1 - (customFees[best.key]?.sell ?? 0.10) / 100);
      return curEff > bestEff ? cur : best;
    });

    const buyKey = arbBuyEx || autoBuy.key;
    const sellKey = arbSellEx || autoSell.key;

    if (buyKey === sellKey) return { sameExchange: true as const };

    const buyEx = data.exchanges[buyKey];
    const sellEx = data.exchanges[sellKey];
    if (buyEx?.status !== "ok" || sellEx?.status !== "ok") return null;

    const buyPrice = getBuyPrice(buyEx);
    const sellPrice = getSellPrice(sellEx);
    if (buyPrice <= 0 || sellPrice <= 0) return null;

    const buyFeeVal = (customFees[buyKey]?.buy ?? 0.10) / 100;
    const sellFeeVal = (customFees[sellKey]?.sell ?? 0.10) / 100;
    const usdtReceived = (amount / buyPrice) * (1 - buyFeeVal);
    const brlReceived = usdtReceived * sellPrice * (1 - sellFeeVal);
    const profit = brlReceived - amount;

    return {
      sameExchange: false as const,
      buyKey, sellKey,
      buyLabel: buyEx.label, sellLabel: sellEx.label,
      buyPrice,
      sellPrice,
      buyFee: buyFeeVal * 100, sellFee: sellFeeVal * 100,
      usdtReceived, brlReceived,
      profit, profitPct: (profit / amount) * 100, amount,
    };
  }, [data, okCards, arbAmount, arbBuyEx, arbSellEx, customFees]);

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: "24px" }}>
      <div className="page-container" style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="hero-copy">
            <h1 className="hero-title" style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>USDT/BRL Pulse</h1>
            <p className="hero-subtitle" style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento em tempo real com atualizacao a cada 5 segundos.
            </p>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href="/fan-tokens"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Abrir Geral
            </Link>
            <Link
              href="/usdt-infinity2"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              USDT Infinity
            </Link>
            {/* <Link
              href="/spot-futures"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Spot x Futuro
            </Link> */}
            <Link
              href="/arbitragem-scanner"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Scanner
            </Link>
            <Link
              href="/depeg"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              De-peg
            </Link>
            <Link
              href="/admin"
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                textDecoration: "none",
                background: "var(--card)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Admin
            </Link>
            <select
              className="theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                background: "var(--card)",
                color: "var(--text)",
                backdropFilter: "blur(10px)",
              }}
            >
              <option value="auto">Tema: Auto</option>
              <option value="light">Tema: Claro</option>
              <option value="dark">Tema: Escuro</option>
            </select>

            <button
              className="refresh-button"
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
                backdropFilter: "blur(10px)",
              }}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button
              onClick={logout}
              disabled={loggingOut}
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                padding: "10px 12px",
                background: "var(--card)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              {loggingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </header>

        <div className="status-line" style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          {data ? `${okCards.length} de ${ORDER.length} corretoras ativas` : "Carregando..."} · proxima atualizacao em {countdown}s
        </div>

        {visibleSummary && (
          <section
            className="summary-grid"
            style={{
              marginTop: 18,
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: 16,
              padding: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              boxShadow: "var(--shadow)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div><strong style={{ color: "var(--muted)" }}>Media</strong><div style={{ marginTop: 4 }}>{money(visibleSummary.avg)}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Minimo</strong><div style={{ marginTop: 4 }}>{money(visibleSummary.min)} · {visibleSummary.minExchange}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Maximo</strong><div style={{ marginTop: 4 }}>{money(visibleSummary.max)} · {visibleSummary.maxExchange}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Spread</strong><div style={{ marginTop: 4 }}>{visibleSummary.spreadPct.toFixed(4)}%</div></div>
          </section>
        )}

        <section className={styles.modernGrid}>
          {cards.map(({ key, ex }) => {
            if (!ex) return null;
            const ok = ex.status === "ok";
            return (
              <article key={key} className={styles.cardModern}>
                <div className={styles.cardHeader}>
                  <img
                    className={styles.cardLogo}
                    src={`https://www.google.com/s2/favicons?domain=${EXCHANGE_META[key]?.domain ?? ""}&sz=64`}
                    alt={`${ex.label} logo`}
                  />
                  <span className={styles.cardTitle}>{ex.label}</span>
                  <span className={ok ? styles.cardStatusOnline : styles.cardStatusError + " " + styles.cardStatus}>
                    {ok ? "online" : "erro"}
                  </span>
                </div>
                {ok ? (
                  <>
                    <div className={styles.cardPrice}>{money(getBookTradePrice(ex))}</div>
                    <div className={styles.cardMetrics}>
                      <span>Book (comercial): {bookMoney(getBookTradePrice(ex))}</span>
                      <span>Atual: {money(getCurrentPrice(ex))}</span>
                    </div>
                    <div className={styles.cardMetrics}>
                      <span>Compra (ask): {bookMoney(getBuyPrice(ex))}</span>
                      <span>Venda (bid): {bookMoney(getSellPrice(ex))}</span>
                    </div>
                    {(ex.pricing_mode === "fallback" || ex.warning || ex.source_pair) && (
                      <div className={styles.cardWarning}>
                        {ex.warning ?? `Preco estimado sem par BRL direto; fonte: ${ex.source_pair ?? "USDT/USD"}. Pode haver variacao.`}
                      </div>
                    )}
                    <div className={styles.cardMetrics}>
                      <span>24h: {ex.change_24h?.toFixed(4)}% · Vol: {vol(ex.volume_24h ?? 0)}</span>
                      <span>Max: {money(ex.high_24h ?? 0)} · Min: {money(ex.low_24h ?? 0)}</span>
                    </div>
                  </>
                ) : (
                  <div className={styles.cardWarning} style={{ color: "var(--error)", marginTop: 10 }}>{ex.error}</div>
                )}
              </article>
            );
          })}
        </section>

        {/* ── Calculadora de Arbitragem ── */}
        <section
          className="arb-section"
          style={{
            marginTop: 18,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            padding: 20,
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(14px)",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, letterSpacing: "-0.4px" }}>
            Calculadora de Arbitragem
          </h2>

          {/* Inputs */}
          <div className="arb-inputs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Valor (BRL)</div>
              <input
                type="number"
                min="0"
                step="100"
                value={arbAmount}
                onChange={(e) => setArbAmount(e.target.value)}
                placeholder="Ex: 1000"
                style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "9px 11px", background: "var(--card)", color: "var(--text)", fontSize: 14, width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comprar em</div>
              <select
                value={arbBuyEx}
                onChange={(e) => setArbBuyEx(e.target.value)}
                style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "9px 11px", background: "var(--card)", color: "var(--text)", fontSize: 14, width: "100%" }}
              >
                <option value="">Auto (mais barata)</option>
                {cards.map(({ key, ex }) => {
                  const unavailable = ex.status !== "ok" || getBuyPrice(ex) <= 0;
                  return (
                    <option key={key} value={key} disabled={unavailable}>
                      {ex.label}{unavailable ? " (indisponivel)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Vender em</div>
              <select
                value={arbSellEx}
                onChange={(e) => setArbSellEx(e.target.value)}
                style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "9px 11px", background: "var(--card)", color: "var(--text)", fontSize: 14, width: "100%" }}
              >
                <option value="">Auto (mais cara)</option>
                {cards.map(({ key, ex }) => {
                  const unavailable = ex.status !== "ok" || getSellPrice(ex) <= 0;
                  return (
                    <option key={key} value={key} disabled={unavailable}>
                      {ex.label}{unavailable ? " (indisponivel)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {arbSelectionError && (
            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid #d97706", borderRadius: 10, color: "#b45309", fontSize: 13 }}>
              {arbSelectionError}
            </div>
          )}

          {/* Resultado */}
          {arbResult && (
            arbResult.sameExchange ? (
              <div style={{ marginTop: 14, padding: "12px 16px", border: "1px solid var(--error)", borderRadius: 10, color: "var(--error)", fontSize: 14 }}>
                Selecione exchanges diferentes para compra e venda.
              </div>
            ) : (
              <div
                className="arb-result"
                style={{ marginTop: 14, background: "rgba(128,128,128,0.06)", border: "1px solid var(--card-border)", borderRadius: 12, padding: 16 }}
              >
                {/* Rota */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "6px 12px" }}>
                    <span style={{ color: "var(--muted)" }}>Comprar:</span>{" "}
                    <strong>{arbResult.buyLabel}</strong> · {money(arbResult.buyPrice)} · taxa {arbResult.buyFee.toFixed(2)}%
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: 20 }}>→</span>
                  <div style={{ fontSize: 13, background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 8, padding: "6px 12px" }}>
                    <span style={{ color: "var(--muted)" }}>Vender:</span>{" "}
                    <strong>{arbResult.sellLabel}</strong> · {money(arbResult.sellPrice)} · taxa {arbResult.sellFee.toFixed(2)}%
                  </div>
                </div>

                {/* Métricas */}
                <div className="arb-result-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Capital</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>R$ {arbResult.amount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>USDT comprado</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{arbResult.usdtReceived.toFixed(4)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>BRL retornado</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>R$ {arbResult.brlReceived.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Resultado</div>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px", color: arbResult.profit >= 0 ? "var(--ok)" : "var(--error)" }}>
                      {arbResult.profit >= 0 ? "+" : ""}R$ {arbResult.profit.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: arbResult.profit >= 0 ? "var(--ok)" : "var(--error)" }}>
                      {arbResult.profitPct >= 0 ? "+" : ""}{arbResult.profitPct.toFixed(4)}%
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Toggle editar taxas */}
          <button
            onClick={() => setShowFees((f) => !f)}
            style={{ marginTop: 14, border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 14px", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
          >
            {showFees ? "▲ Ocultar taxas" : "▼ Editar taxas por exchange"}
          </button>

          {showFees && (
            <div className="arb-fees-grid" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {ORDER.map((key) => {
                const ex = data?.exchanges[key];
                if (!ex) return null;
                const fees = customFees[key] ?? { buy: 0.10, sell: 0.10 };
                return (
                  <div key={key} style={{ padding: "10px 12px", border: "1px solid var(--card-border)", borderRadius: 10, background: "var(--card)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{ex.label}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>
                        Compra (%)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={fees.buy}
                          onChange={(e) =>
                            setCustomFees((prev) => ({ ...prev, [key]: { ...prev[key], buy: parseFloat(e.target.value) || 0 } }))
                          }
                          style={{ marginTop: 4, display: "block", border: "1px solid var(--card-border)", borderRadius: 6, padding: "5px 8px", background: "var(--bg)", color: "var(--text)", fontSize: 12, width: "100%" }}
                        />
                      </label>
                      <label style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>
                        Venda (%)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={fees.sell}
                          onChange={(e) =>
                            setCustomFees((prev) => ({ ...prev, [key]: { ...prev[key], sell: parseFloat(e.target.value) || 0 } }))
                          }
                          style={{ marginTop: 4, display: "block", border: "1px solid var(--card-border)", borderRadius: 6, padding: "5px 8px", background: "var(--bg)", color: "var(--text)", fontSize: 12, width: "100%" }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .page-shell {
          overflow-x: hidden;
        }

        @media (max-width: 760px) {
          .page-shell {
            padding: 16px !important;
          }

          .page-header {
            align-items: stretch !important;
          }

          .hero-copy,
          .header-actions {
            width: 100%;
          }

          .hero-title {
            font-size: 28px !important;
            line-height: 1.05;
          }

          .hero-subtitle {
            font-size: 14px !important;
            line-height: 1.45;
            max-width: 32ch;
          }

          .header-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .theme-select,
          .refresh-button {
            width: 100%;
            min-height: 44px;
          }

          .status-line {
            line-height: 1.5;
          }

          .summary-grid {
            padding: 14px !important;
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }

          .cards-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .exchange-card {
            padding: 14px !important;
          }

          .card-header {
            align-items: flex-start !important;
            gap: 10px;
          }

          .card-brand {
            min-width: 0;
            gap: 8px !important;
          }

          .exchange-logo {
            width: 18px;
            height: 18px;
            margin-top: 2px;
          }

          .exchange-name {
            font-size: 16px !important;
            line-height: 1.2;
          }

          .status-chip {
            white-space: nowrap;
          }

          .price-value {
            font-size: 26px !important;
            line-height: 1.1;
            word-break: break-word;
          }

          .metric-line {
            font-size: 12px !important;
            line-height: 1.5;
          }
        }

        @media (max-width: 420px) {
          .page-shell {
            padding: 12px !important;
          }

          .header-actions {
            grid-template-columns: 1fr;
          }

          .hero-title {
            font-size: 25px !important;
          }

          .status-line {
            font-size: 12px !important;
          }

          .summary-grid,
          .exchange-card,
          .arb-section {
            border-radius: 14px !important;
          }

          .arb-result-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .arb-fees-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        @media (max-width: 420px) {
          .arb-result-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .arb-fees-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
