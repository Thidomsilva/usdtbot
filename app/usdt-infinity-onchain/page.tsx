"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import OnChainDirectMatrix from "@/components/OnChainDirectMatrix";
import type { OnChainMatrixResponse } from "@/lib/polygon-brl-onchain";

export default function UsdtInfinityOnChainPage() {
  const [data, setData] = useState<OnChainMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lotBrl, setLotBrl] = useState("1000");
  const [thresholdPct, setThresholdPct] = useState("0.5");

  async function load() {
    setLoading(true);
    try {
      const lot = Number(lotBrl.replace(/[^\d.]/g, ""));
      const threshold = Number(thresholdPct.replace(/[^\d.]/g, ""));
      const qs = new URLSearchParams({
        lot_brl: String(Number.isFinite(lot) && lot > 0 ? lot : 1000),
        threshold_pct: String(Number.isFinite(threshold) && threshold > 0 ? threshold : 0.5),
      });
      const res = await fetch(`/api/usdt-infinity/on-chain?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as OnChainMatrixResponse;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (err) {
      setData(null);
      setError(String(err ?? "Falha ao consultar pools on-chain"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="page-shell" style={{ minHeight: "100vh", padding: 24 }}>
      <div className="page-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 8, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT/BRL</Link>
              <Link href="/usdt-infinity" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT Infinity</Link>
              <Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Arbitragem Geral</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Arbitragem On-Chain Direta (BRL)</h1>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
              Visão dedicada para comparar BRLA, BRL1 e BRZ em Polygon usando leitura direta de pools.
            </p>
          </div>
          <button
            onClick={load}
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 12,
              padding: "10px 14px",
              background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Lote simulado (BRL)</span>
              <input
                value={lotBrl}
                onChange={(e) => setLotBrl(e.target.value)}
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
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Limiar de alerta (%)</span>
              <input
                value={thresholdPct}
                onChange={(e) => setThresholdPct(e.target.value)}
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
          </div>

          {error && <div style={{ fontSize: 12, color: "#ef4444" }}>Erro: {error}</div>}
        </section>

        <OnChainDirectMatrix
          data={data}
          loading={loading}
          error={error}
          lotBrl={Number(lotBrl.replace(/[^\d.]/g, "")) || 1000}
          thresholdPct={Number(thresholdPct.replace(/[^\d.]/g, "")) || 0.5}
        />
      </div>
    </main>
  );
}
