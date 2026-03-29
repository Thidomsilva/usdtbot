"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricesResponse } from "@/lib/types";

const REFRESH_SECONDS = 5;
const ORDER = ["binance", "bybit", "bitget", "okx", "kucoin", "novadax", "mercadobitcoin"];

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
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.6px" }}>USDT/BRL Monitor</h1>
            <p style={{ margin: "8px 0 0", color: "#475569" }}>Cotacao em tempo real das corretoras brasileiras e com par BRL.</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", background: "white", cursor: "pointer" }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>
          {data ? `${data.ok_count} de ${data.total_count} corretoras ativas` : "Carregando..."} · proxima atualizacao em {countdown}s
        </div>

        {data?.summary && (
          <section style={{ marginTop: 18, background: "#ffffffcc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div><strong>Media</strong><div>{money(data.summary.avg)}</div></div>
            <div><strong>Minimo</strong><div>{money(data.summary.min)} · {data.summary.min_exchange}</div></div>
            <div><strong>Maximo</strong><div>{money(data.summary.max)} · {data.summary.max_exchange}</div></div>
            <div><strong>Spread</strong><div>{data.summary.spread_pct.toFixed(4)}%</div></div>
          </section>
        )}

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {cards.map(({ key, ex }) => {
            if (!ex) return null;
            const ok = ex.status === "ok";
            return (
              <article key={key} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{ex.label}</strong>
                  <span style={{ fontSize: 12, color: ok ? "#15803d" : "#b91c1c" }}>{ok ? "online" : "erro"}</span>
                </div>
                {ok ? (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{money(ex.price_brl ?? 0)}</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                      24h: {ex.change_24h?.toFixed(4)}% · Vol: {vol(ex.volume_24h ?? 0)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                      Max: {money(ex.high_24h ?? 0)} · Min: {money(ex.low_24h ?? 0)}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13 }}>{ex.error}</div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
