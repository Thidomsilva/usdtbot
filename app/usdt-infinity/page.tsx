"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import OnChainDirectMatrix from "../../components/OnChainDirectMatrix";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";
import type { OnChainMatrixResponse } from "../../lib/polygon-brl-onchain";

type DisplayMode = "brl" | "original";
const REFRESH_SECONDS = 10;

const EXCHANGES_LIST = [
  { id: "binance", label: "Binance" },
  { id: "bybit", label: "Bybit" },
  { id: "okx", label: "OKX" },
  { id: "kucoin", label: "KuCoin" },
  { id: "bitget", label: "Bitget" },
  { id: "gate", label: "Gate.io" },
  { id: "kraken", label: "Kraken" },
  { id: "bingx", label: "BingX" },
  { id: "coinbase", label: "Coinbase" },
  { id: "mexc", label: "MEXC" },
  { id: "bitmart", label: "BitMart" },
  { id: "foxbit", label: "Foxbit" },
  { id: "coinex", label: "Coinex" },
  { id: "crypto.com", label: "Crypto.com" },
  { id: "mercadobitcoin", label: "Mercado Bitcoin" },
  { id: "novadax", label: "Novadax" },
];

const ALL_EXCHANGE_IDS = EXCHANGES_LIST.map((e) => e.id);

export default function UsdtInfinityPage() {
  const [capital, setCapital] = useState(1000);
  const [inputValue, setInputValue] = useState("1000");
  const [opportunities, setOpportunities] = useState<InfinityOpportunity[]>([]);
  const [onChainData, setOnChainData] = useState<OnChainMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [onChainLoading, setOnChainLoading] = useState(false);
  const [onChainError, setOnChainError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("brl");
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [selectedExchanges, setSelectedExchanges] = useState<Set<string>>(new Set(ALL_EXCHANGE_IDS));
  const [bookMinBrl, setBookMinBrl] = useState("0");
  const [onChainLotBrl, setOnChainLotBrl] = useState("1000");
  const [onChainThresholdPct, setOnChainThresholdPct] = useState("0.5");
  const [brlReference, setBrlReference] = useState<{ label: string; price: number; sourceUrl?: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("usdt-infinity-display-mode");
    if (saved === "brl" || saved === "original") {
      setDisplayMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("usdt-infinity-display-mode", displayMode);
  }, [displayMode]);

  useEffect(() => {
    const savedBookMin = localStorage.getItem("usdt-infinity-book-min-brl");
    if (savedBookMin) setBookMinBrl(savedBookMin);
    const savedOnChainLot = localStorage.getItem("usdt-infinity-onchain-lot-brl");
    if (savedOnChainLot) setOnChainLotBrl(savedOnChainLot);
    const savedOnChainThreshold = localStorage.getItem("usdt-infinity-onchain-threshold");
    if (savedOnChainThreshold) setOnChainThresholdPct(savedOnChainThreshold);
  }, []);

  useEffect(() => {
    localStorage.setItem("usdt-infinity-book-min-brl", bookMinBrl);
  }, [bookMinBrl]);

  useEffect(() => {
    localStorage.setItem("usdt-infinity-onchain-lot-brl", onChainLotBrl);
  }, [onChainLotBrl]);

  useEffect(() => {
    localStorage.setItem("usdt-infinity-onchain-threshold", onChainThresholdPct);
  }, [onChainThresholdPct]);

  useEffect(() => {
    const saved = localStorage.getItem("usdt-infinity-exchanges");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const allowed = parsed.filter((id) => ALL_EXCHANGE_IDS.includes(id));
          if (allowed.length > 0) {
            setSelectedExchanges(new Set(allowed));
          }
        }
      } catch {}
    }
  }, []);

  function toggleExchange(id: string) {
    setSelectedExchanges((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // pelo menos 1 sempre selecionada
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem("usdt-infinity-exchanges", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function selectAllExchanges() {
    setSelectedExchanges(new Set(ALL_EXCHANGE_IDS));
    localStorage.setItem("usdt-infinity-exchanges", JSON.stringify(ALL_EXCHANGE_IDS));
  }

  async function fetchOpportunities(cap: number) {
    setLoading(true);
    try {
      const [fanRes, pricesRes] = await Promise.all([
        fetch(`/api/fan-tokens?capital=${cap}`, { cache: "no-store" }),
        fetch(`/api/prices`, { cache: "no-store" }),
      ]);
      const data = await fanRes.json();
      const prices = await pricesRes.json();
      const usdBrl = Number(data?.summary?.usd_brl || 0);
      const priceEntries = prices?.exchanges ? Object.entries(prices.exchanges as Record<string, any>) : [];
      const brlSourceEntry =
        priceEntries.find(([, exchange]: [string, any]) => exchange?.status === "ok" && (exchange?.price_brl ?? 0) > 0) ??
        priceEntries.find(([key]) => key === "binance") ??
        priceEntries[0] ??
        null;
      if (brlSourceEntry) {
        const [label, exchange] = brlSourceEntry;
        setBrlReference({
          label: `${label.toUpperCase()} USDT/BRL`,
          price: Number(exchange?.price_brl || 0),
          sourceUrl: exchange?.source_url,
        });
      }
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

          const tokenExchanges = t.exchanges || [];

          const buyExchange = tokenExchanges.find((ex: any) => ex.exchange === t.best_arb.buy_exchange);
          const sellExchange = tokenExchanges.find((ex: any) => ex.exchange === t.best_arb.sell_exchange);

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

          // Orderbooks de todas as exchanges (filtro aplicado no render)
          const allExchangesBooks = tokenExchanges.map((ex: any) => {
            const exCurrency = getBookCurrency(ex);
            const asks = (ex?.orderbook?.asks || []).slice(0, 5).map((l: any) => ({
              priceBrl: convertBookValue(Number(l.price_brl || 0), ex),
              amount: Number(l.amount || 0),
              notionalBrl: convertBookValue(Number(l.notional_brl || 0), ex),
              cumulativeNotionalBrl: convertBookValue(Number(l.cumulative_notional_brl || 0), ex),
            }));
            const bids = (ex?.orderbook?.bids || []).slice(0, 5).map((l: any) => ({
              priceBrl: convertBookValue(Number(l.price_brl || 0), ex),
              amount: Number(l.amount || 0),
              notionalBrl: convertBookValue(Number(l.notional_brl || 0), ex),
              cumulativeNotionalBrl: convertBookValue(Number(l.cumulative_notional_brl || 0), ex),
            }));
            return {
              exchange: ex.exchange,
              label: ex.label || ex.exchange,
              asks,
              bids,
              currency: exCurrency,
              asksCoverage: asks.length > 0 ? asks[asks.length - 1].cumulativeNotionalBrl : 0,
              bidsCoverage: bids.length > 0 ? bids[bids.length - 1].cumulativeNotionalBrl : 0,
            };
          });

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
            allExchangesBooks,
            fromExchangeId: t.best_arb.buy_exchange,
            toExchangeId: t.best_arb.sell_exchange,
          };
        })
        .filter(Boolean) as InfinityOpportunity[];

      const sortedFound = found.slice().sort((a, b) => {
        const spreadDelta = (b.profitPercent ?? 0) - (a.profitPercent ?? 0);
        if (spreadDelta !== 0) return spreadDelta;
        return (b.profit ?? 0) - (a.profit ?? 0);
      });

      setOpportunities(sortedFound);
    } catch (e) {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOnChainMatrix() {
    setOnChainLoading(true);
    try {
      const lot = Number(onChainLotBrl.replace(/[^\d.]/g, ""));
      const threshold = Number(onChainThresholdPct.replace(/[^\d.]/g, ""));
      const qs = new URLSearchParams({
        lot_brl: String(Number.isFinite(lot) && lot > 0 ? lot : 1000),
        threshold_pct: String(Number.isFinite(threshold) && threshold > 0 ? threshold : 0.5),
      });
      const res = await fetch(`/api/usdt-infinity/on-chain?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as OnChainMatrixResponse;
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setOnChainData(json);
      setOnChainError(null);
    } catch (err) {
      setOnChainData(null);
      setOnChainError(String(err ?? "Falha ao consultar pools on-chain"));
    } finally {
      setOnChainLoading(false);
    }
  }

  useEffect(() => {
    fetchOpportunities(capital);
    fetchOnChainMatrix();
    const refreshTimer = setInterval(() => {
      fetchOpportunities(capital);
      fetchOnChainMatrix();
    }, REFRESH_SECONDS * 1000);

    const countdownTimer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
    // eslint-disable-next-line
  }, [capital, displayMode, onChainLotBrl, onChainThresholdPct]);

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
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>Voltar para USDT/BRL</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir Arbitragem Geral</Link>
              <Link href="/depeg" style={{ textDecoration: "none", color: "var(--muted)" }}>Abrir De-peg</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>USDT Infinity</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Oportunidades de arbitragem cross-exchange com base na mesma malha de dados da Arbitragem Geral.
            </p>
          </div>
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
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
            {brlReference && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--card-border)",
                  background: "rgba(255,255,255,0.05)",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <span style={{ fontWeight: 700, color: "var(--text)" }}>Referência BRL</span>
                <span>{brlReference.label} · R$ {brlReference.price.toFixed(4)}</span>
                {brlReference.sourceUrl && (
                  <a href={brlReference.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>
                    fonte
                  </a>
                )}
              </div>
            )}
          </div>
        </header>

        <section
          style={{
            marginTop: 16,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            boxShadow: "var(--shadow)",
            padding: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Exchanges monitoradas
            </span>
            <button
              onClick={selectAllExchanges}
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 8,
                padding: "3px 10px",
                background: "transparent",
                color: "var(--muted)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Selecionar todas
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {EXCHANGES_LIST.map((ex) => {
              const active = selectedExchanges.has(ex.id);
              return (
                <button
                  key={ex.id}
                  onClick={() => toggleExchange(ex.id)}
                  style={{
                    border: `1px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
                    borderRadius: 999,
                    padding: "4px 12px",
                    background: active ? "rgba(0,200,150,0.12)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {ex.label}
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            marginTop: 10,
            marginBottom: 18,
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 16,
            boxShadow: "var(--shadow)",
            padding: 16,
          }}
        >
          <form onSubmit={handleSimulate} style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
              <label htmlFor="capital" style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Valor para simulacao (USDT)</span>
                <input
                  id="capital"
                  type="number"
                  min={10}
                  step={10}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  style={{
                    width: "100%",
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
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Filtrar lote minimo no book (R$)</span>
                <input
                  value={bookMinBrl}
                  onChange={(e) => setBookMinBrl(e.target.value)}
                  inputMode="decimal"
                  style={{
                    width: "100%",
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
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Lote on-chain BRL (R$)</span>
                <input
                  value={onChainLotBrl}
                  onChange={(e) => setOnChainLotBrl(e.target.value)}
                  inputMode="decimal"
                  style={{
                    width: "100%",
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
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Limiar on-chain (%)</span>
                <input
                  value={onChainThresholdPct}
                  onChange={(e) => setOnChainThresholdPct(e.target.value)}
                  inputMode="decimal"
                  style={{
                    width: "100%",
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
              </label>
            </div>
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
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              Capital atual: <strong style={{ color: "var(--text)" }}>{capital} USDT</strong>
            </span>
          </form>
          <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
            Proxima atualizacao automatica em {countdown}s
          </div>
          {loading && <p style={{ margin: "12px 0 0", color: "var(--accent)", fontSize: 13 }}>Buscando oportunidades...</p>}
        </section>

        {(() => {
          const visibleOpps = opportunities
            .filter(
              (opp) =>
                selectedExchanges.has(opp.fromExchangeId ?? "") &&
                selectedExchanges.has(opp.toExchangeId ?? "")
            )
            .filter((opp) => {
              const minBook = Number(bookMinBrl.replace(/[^\d.]/g, ""));
              if (!Number.isFinite(minBook) || minBook <= 0) return true;
              const buyCoverage = opp.buyBookCoverageBrl ?? 0;
              const sellCoverage = opp.sellBookCoverageBrl ?? 0;
              return buyCoverage >= minBook && sellCoverage >= minBook;
            })
            .map((opp) => ({
              ...opp,
              allExchangesBooks: (opp.allExchangesBooks ?? []).filter((b) =>
                selectedExchanges.has(b.exchange)
              ),
            }));

          if (visibleOpps.length === 0 && !loading) {
            return (
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
                Nenhuma oportunidade encontrada com as exchanges selecionadas.
              </section>
            );
          }

          return (
            <section style={{ display: "grid", gap: 14 }}>
              {visibleOpps.map((opp, idx) => (
                <OpportunityCard key={idx} {...opp} capital={capital} />
              ))}
            </section>
          );
        })()}

        <OnChainDirectMatrix
          data={onChainData}
          loading={onChainLoading}
          error={onChainError}
          lotBrl={Number(onChainLotBrl.replace(/[^\d.]/g, "")) || 1000}
          thresholdPct={Number(onChainThresholdPct.replace(/[^\d.]/g, "")) || 0.5}
        />
      </div>
    </main>
  );
}
