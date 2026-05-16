"use client";
import React, { useState, useEffect } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";

export default function USDTInfinity() {
  const [capital, setCapital] = useState(1000);
  const [inputValue, setInputValue] = useState("1000");
  const [ops, setOps] = useState<InfinityOpportunity[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchOps(cap: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/usdt-infinity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: cap }),
      });
      const data = await res.json();
      setOps(Array.isArray(data.opportunities) ? data.opportunities : []);
    } catch {
      setOps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOps(capital);
    // eslint-disable-next-line
  }, [capital]);

  function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(inputValue.replace(/[^\d.]/g, ""));
    if (!isNaN(val) && val > 0) {
      setCapital(val);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060d1a; color: #c0d4e8; font-family: 'Inter', sans-serif; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e3050; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#060d1a", borderBottom: "1px solid #0d1828", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", height: 52, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "18px", color: "#2563eb" }}>∞</span>
            <span style={{ fontSize: "14px", fontWeight: 800, color: "#e2f0ff", letterSpacing: "-0.02em" }}>USDT Infinity</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <form onSubmit={handleSimulate} style={{ background: "#060d1a", borderBottom: "1px solid #0d1828", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" value={inputValue} onChange={e => setInputValue(e.target.value)} className="cinput" />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2a4060", fontFamily: "monospace" }}>USDT</span>
        </div>
        <button type="submit" className="fbtn on">Simular</button>
        {loading && <span style={{ color: "#60a5fa", fontSize: 12, marginLeft: 12 }}>Buscando oportunidades...</span>}
      </form>

      {/* Table header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 24px", borderBottom: "1px solid #0d1828", background: "#060d1a" }}>
        {[{ l: "Par", w: 130 }, { l: "De", w: 120 }, { l: "Para", w: 120 }, { l: "Rede", w: 120 }, { l: "Lucro líquido", w: 140, right: true }, { l: "", w: 20 }].map((col, i) => (
          <div key={i} style={{ fontSize: "10px", color: "#2a4060", textTransform: "uppercase", letterSpacing: "0.07em", width: col.w, textAlign: col.right ? "right" : "left", flexShrink: 0 }}>
            {col.l}
          </div>
        ))}
      </div>

      {/* Rows */}
      {ops.length === 0 && !loading && (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#1e3050", fontSize: "13px" }}>
          Nenhuma oportunidade encontrada.
        </div>
      )}

      {ops.map((op, idx) => (
        <div key={idx} style={{ borderBottom: "1px solid #0d1828", padding: "13px 24px" }}>
          <OpportunityCard {...op} capital={capital} />
        </div>
      ))}
    </>
  );
}
