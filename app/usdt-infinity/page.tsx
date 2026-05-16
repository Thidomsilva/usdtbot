"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";

type DisplayMode = "brl" | "original";
const REFRESH_SECONDS = 10;

export default function UsdtInfinityPage() {
  const [capital, setCapital] = useState(1000);
  const [inputValue, setInputValue] = useState("1000");
  const [opportunities, setOpportunities] = useState<InfinityOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("brl");
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);

  useEffect(() => {
    const saved = localStorage.getItem("usdt-infinity-display-mode");
    if (saved === "brl" || saved === "original") {
      setDisplayMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("usdt-infinity-display-mode", displayMode);
  }, [displayMode]);

  async function fetchOpportunities(cap: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/fan-tokens?capital=${cap}`, { cache: "no-store" });
      const data = await res.json();
      const usdBrl = Number(data?.summary?.usd_brl || 0);
      const brlToUsd = (value: number) => (usdBrl > 0 ? value / usdBrl : value);
      const resolveDisplayPrice = (exchange: any, fallbackBrl: number, side: "ask" | "bid") => {
        if (displayMode === "original") {
          const originalCurrency = exchange?.original_currency;
          const originalPrice = Number(side === "ask" ? exchange?.original_ask_price : exchange?.original_bid_price);
          if ((originalCurrency === "USDT" || originalCurrency === "BRL") && Number.isFinite(originalPrice) && originalPrice > 0) {
            return { value: originalPrice, currency: originalCurrency as "BRL" | "USDT" };
          }
          if (originalCurrency === "BRL") {
            return { value: Number(fallbackBrl || 0), currency: "BRL" as const };
          }
          return { value: brlToUsd(Number(fallbackBrl || 0)), currency: "USDT" as const };
        }

        return { value: Number(fallbackBrl || 0), currency: "BRL" as const };
      };

      const convertBookValue = (valueBrl: number, exchange: any) => {
        if (displayMode === "original" && exchange?.original_currency === "USDT") {
          return brlToUsd(valueBrl);
        }
        return valueBrl;
      };

      const getBookCurrency = (exchange: any): "BRL" | "USDT" => {
        if (displayMode === "original" && exchange?.original_currency === "USDT") {
          return "USDT";
        }
        return "BRL";
      };
      const found = (data.tokens || [])
        .map((t: any) => {
          if (!t.best_arb || t.best_arb.spread_pct <= 0) return null;

          const buyExchange = (t.exchanges || []).find((ex: any) => ex.exchange === t.best_arb.buy_exchange);
          const sellExchange = (t.exchanges || []).find((ex: any) => ex.exchange === t.best_arb.sell_exchange);

          const askValue = resolveDisplayPrice(buyExchange, t.best_arb.buy_price_brl, "ask");
          const bidValue = resolveDisplayPrice(sellExchange, t.best_arb.sell_price_brl, "bid");

          const buyBookCurrency = getBookCurrency(buyExchange);
          const sellBookCurrency = getBookCurrency(sellExchange);

          const profitBrl = t.best_arb.profit_est_brl_per_100 ? Number(t.best_arb.profit_est_brl_per_100 || 0) * (cap / 100) : 0;
          const profitValue = displayMode === "original" && buyBookCurrency === "USDT" && sellBookCurrency === "USDT"
            ? brlToUsd(profitBrl)
            : profitBrl;
          const profitCurrency: "BRL" | "USDT" = displayMode === "original" && buyBookCurrency === "USDT" && sellBookCurrency === "USDT"
            ? "USDT"
            : "BRL";

          const buyBookTop = (buyExchange?.orderbook?.asks || []).slice(0, 5).map((l: any) => ({
            priceBrl: convertBookValue(Number(l.price_brl || 0), buyExchange),
            amount: Number(l.amount || 0),
            notionalBrl: convertBookValue(Number(l.notional_brl || 0), buyExchange),
            cumulativeNotionalBrl: convertBookValue(Number(l.cumulative_notional_brl || 0), buyExchange),
          }));

          const sellBookTop = (sellExchange?.orderbook?.bids || []).slice(0, 5).map((l: any) => ({
            priceBrl: convertBookValue(Number(l.price_brl || 0), sellExchange),
            amount: Number(l.amount || 0),
            notionalBrl: convertBookValue(Number(l.notional_brl || 0), sellExchange),
            cumulativeNotionalBrl: convertBookValue(Number(l.cumulative_notional_brl || 0), sellExchange),
          }));

          return {
            asset: t.symbol,
            fromExchange: t.best_arb.buy_exchange_label,
            toExchange: t.best_arb.sell_exchange_label,
            ask: askValue.value,
            askCurrency: askValue.currency,
            bid: bidValue.value,
            bidCurrency: bidValue.currency,
            network: "-",
            fees: { buy: t.best_arb.buy_fee_pct, withdraw: 0, sell: t.best_arb.sell_fee_pct },
            liquidity: 0,
            profit: profitValue,
            profitCurrency,
            profitPercent: t.best_arb.net_spread_pct ?? 0,
            playbook: [
              `Comprar em ${t.best_arb.buy_exchange_label}`,
              `Vender em ${t.best_arb.sell_exchange_label}`,
            ],
            buyBookTop,
            sellBookTop,
            buyBookCoverageBrl: buyBookTop.length > 0 ? buyBookTop[buyBookTop.length - 1].cumulativeNotionalBrl : 0,
            sellBookCoverageBrl: sellBookTop.length > 0 ? sellBookTop[sellBookTop.length - 1].cumulativeNotionalBrl : 0,
            buyBookCurrency,
            sellBookCurrency,
            bookLevels: Math.max(buyBookTop.length, sellBookTop.length),
          };
        })
        .filter(Boolean);
      setOpportunities(found);
    } catch (e) {
      setOpportunities([]);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }

  useEffect(() => {
    fetchOpportunities(capital);
    const refreshTimer = setInterval(() => {
      fetchOpportunities(capital);
    }, REFRESH_SECONDS * 1000);

    const countdownTimer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
    // eslint-disable-next-line
  }, [capital, displayMode]);

  function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(inputValue.replace(/[^\d.]/g, ""));
    if (!isNaN(val) && val > 0) {
      setCapital(val);
    }
  }

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1160, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>Voltar para USDT/BRL</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir Arbitragem Geral</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>USDT Infinity</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Oportunidades de arbitragem cross-exchange com base na mesma malha de dados da Arbitragem Geral.
            </p>
          </div>
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
        </header>

        <section
          style={{
            marginTop: 18,
            marginBottom: 18,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            boxShadow: "var(--shadow)",
            padding: 16,
          }}
        >
          <form onSubmit={handleSimulate} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label htmlFor="capital" style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
              Valor para simulacao (USDT):
            </label>
            <input
              id="capital"
              type="number"
              min={10}
              step={10}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              style={{
                width: 140,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--card-border)",
                background: "transparent",
                color: "var(--text)",
                fontSize: 16,
                fontWeight: 700,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                border: "1px solid transparent",
                borderRadius: 10,
                padding: "10px 14px",
                background: "var(--accent)",
                color: "#03212f",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Simular
            </button>
            <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 13 }}>
              Capital atual: <strong style={{ color: "var(--text)" }}>{capital} USDT</strong>
            </span>
          </form>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Proxima atualizacao automatica em {countdown}s
          </div>
          {loading && <p style={{ margin: "12px 0 0", color: "var(--accent)", fontSize: 13 }}>Buscando oportunidades...</p>}
        </section>

        {opportunities.length === 0 && !loading && (
          <section
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: 16,
              boxShadow: "var(--shadow)",
              padding: 24,
              textAlign: "center",
              color: "var(--muted)",
            }}
          >
            Nenhuma oportunidade encontrada agora.
          </section>
        )}

        <section style={{ display: "grid", gap: 14 }}>
          {opportunities.map((opp, idx) => (
            <OpportunityCard key={idx} {...opp} capital={capital} />
          ))}
        </section>
      </div>
    </main>
  );
}
