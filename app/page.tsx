"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricesResponse } from "@/lib/types";

const REFRESH_SECONDS = 5;
const ORDER = ["binance", "bybit", "bitget", "okx", "kucoin", "novadax", "mercadobitcoin"];
type ThemeMode = "auto" | "light" | "dark";

const EXCHANGE_META: Record<string, { domain: string }> = {
  binance: { domain: "binance.com" },
  bybit: { domain: "bybit.com" },
  bitget: { domain: "bitget.com" },
  okx: { domain: "okx.com" },
  kucoin: { domain: "kucoin.com" },
  novadax: { domain: "novadax.com" },
  mercadobitcoin: { domain: "mercadobitcoin.com.br" },
};

function money(v: number) {
  return `R$ ${v.toFixed(4)}`;
}

function vol(v: number) {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

export default function HomePage() {
  const [data, setData] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [theme, setTheme] = useState<ThemeMode>("auto");

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
          </div>
        </header>

        <div className="status-line" style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          {data ? `${data.ok_count} de ${data.total_count} corretoras ativas` : "Carregando..."} · proxima atualizacao em {countdown}s
        </div>

        {data?.summary && (
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
            <div><strong style={{ color: "var(--muted)" }}>Media</strong><div style={{ marginTop: 4 }}>{money(data.summary.avg)}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Minimo</strong><div style={{ marginTop: 4 }}>{money(data.summary.min)} · {data.summary.min_exchange}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Maximo</strong><div style={{ marginTop: 4 }}>{money(data.summary.max)} · {data.summary.max_exchange}</div></div>
            <div><strong style={{ color: "var(--muted)" }}>Spread</strong><div style={{ marginTop: 4 }}>{data.summary.spread_pct.toFixed(4)}%</div></div>
          </section>
        )}

        <section className="cards-grid" style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {cards.map(({ key, ex }) => {
            if (!ex) return null;
            const ok = ex.status === "ok";
            return (
              <article
                key={key}
                className="exchange-card"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: "var(--shadow)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="card-brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img
                      className="exchange-logo"
                      src={`https://www.google.com/s2/favicons?domain=${EXCHANGE_META[key]?.domain ?? ""}&sz=64`}
                      alt={`${ex.label} logo`}
                      width={20}
                      height={20}
                      style={{ borderRadius: 999, display: "block" }}
                    />
                    <strong className="exchange-name" style={{ fontSize: 17 }}>{ex.label}</strong>
                  </div>
                  <span
                    className="status-chip"
                    style={{
                      fontSize: 11,
                      color: ok ? "var(--ok)" : "var(--error)",
                      border: `1px solid ${ok ? "var(--ok)" : "var(--error)"}`,
                      borderRadius: 999,
                      padding: "3px 8px",
                    }}
                  >
                    {ok ? "online" : "erro"}
                  </span>
                </div>
                {ok ? (
                  <>
                    <div className="price-value" style={{ fontSize: 30, fontWeight: 800, marginTop: 8, letterSpacing: "-0.5px" }}>{money(ex.price_brl ?? 0)}</div>
                    <div className="metric-line" style={{ marginTop: 9, fontSize: 13, color: "var(--muted)" }}>
                      24h: {ex.change_24h?.toFixed(4)}% · Vol: {vol(ex.volume_24h ?? 0)}
                    </div>
                    <div className="metric-line" style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
                      Max: {money(ex.high_24h ?? 0)} · Min: {money(ex.low_24h ?? 0)}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 10, color: "var(--error)", fontSize: 13 }}>{ex.error}</div>
                )}
              </article>
            );
          })}
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
          .exchange-card {
            border-radius: 14px !important;
          }
        }
      `}</style>
    </main>
  );
}
