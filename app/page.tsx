"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricesResponse } from "@/lib/types";

const REFRESH_SECONDS = 5;
const ORDER = ["binance", "bybit", "bitget", "okx", "kucoin", "novadax", "mercadobitcoin"];
type ThemeMode = "auto" | "light" | "dark";

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
    return ORDER.map((key) => ({ key, ex: data.exchanges[key] })).filter((i) => !!i.ex);
  }, [data]);

  return (
    <main style={{ minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>USDT/BRL Pulse</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Monitoramento em tempo real com atualizacao a cada 5 segundos.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
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

        <div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
          {data ? `${data.ok_count} de ${data.total_count} corretoras ativas` : "Carregando..."} · proxima atualizacao em {countdown}s
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

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {cards.map(({ key, ex }) => {
            if (!ex) return null;
            const ok = ex.status === "ok";
            return (
              <article
                key={key}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: "var(--shadow)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 17 }}>{ex.label}</strong>
                  <span
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
                    <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8, letterSpacing: "-0.5px" }}>{money(ex.price_brl ?? 0)}</div>
                    <div style={{ marginTop: 9, fontSize: 13, color: "var(--muted)" }}>
                      24h: {ex.change_24h?.toFixed(4)}% · Vol: {vol(ex.volume_24h ?? 0)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted)" }}>
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
    </main>
  );
}
