"use client";
import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";


"use client";

import { useState, useEffect, useCallback } from "react";

const EXCHANGES = ["Binance", "OKX", "Bybit", "KuCoin", "Gate.io", "Kraken", "MEXC", "Huobi"];
const ASSETS = ["SOL", "BNB", "AVAX", "MATIC", "ARB", "OP", "TRX", "ATOM", "DOT", "LINK", "UNI", "APT", "SUI", "INJ", "TIA"];
const NETWORKS = {
  SOL:   { name: "Solana",    fee: 0.00025, fast: true,  color: "#9945FF" },
  BNB:   { name: "BEP20",     fee: 0.001,   fast: true,  color: "#F0B90B" },
  AVAX:  { name: "Avalanche", fee: 0.01,    fast: true,  color: "#E84142" },
  MATIC: { name: "Polygon",   fee: 0.001,   fast: true,  color: "#8247E5" },
  ARB:   { name: "Arbitrum",  fee: 0.0005,  fast: true,  color: "#12AAFF" },
  OP:    { name: "Optimism",  fee: 0.0008,  fast: true,  color: "#FF0420" },
  TRX:   { name: "TRC20",     fee: 1.0,     fast: false, color: "#EF0027" },
  ATOM:  { name: "Cosmos",    fee: 0.005,   fast: true,  color: "#6F4CE6" },
  DOT:   { name: "Polkadot",  fee: 0.1,     fast: false, color: "#E6007A" },
  LINK:  { name: "ERC20",     fee: 2.5,     fast: false, color: "#4A90E2" },
  UNI:   { name: "ERC20",     fee: 2.5,     fast: false, color: "#FF007A" },
  APT:   { name: "Aptos",     fee: 0.0002,  fast: true,  color: "#00D4B4" },
  SUI:   { name: "Sui",       fee: 0.001,   fast: true,  color: "#6FBCF0" },
  INJ:   { name: "Injective", fee: 0.005,   fast: true,  color: "#00A3FF" },
  TIA:   { name: "Celestia",  fee: 0.003,   fast: true,  color: "#7B2BF9" },
};

function genOps(capital) {
  const ops = [];
  for (let i = 0; i < 15; i++) {
    const asset = ASSETS[i % ASSETS.length];
    const buyEx = EXCHANGES[Math.floor(Math.random() * EXCHANGES.length)];
    let sellEx = EXCHANGES[Math.floor(Math.random() * EXCHANGES.length)];
    while (sellEx === buyEx) sellEx = EXCHANGES[Math.floor(Math.random() * EXCHANGES.length)];

    const base = 5 + Math.random() * 200;
    const pct = 0.003 + Math.random() * 0.035;

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
            </div>

            {/* Fee breakdown */}
            <div style={{ minWidth: 240 }}>
              <div style={{ fontSize: "10px", color: "#3a5070", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Breakdown de taxas</div>
              {[
                ["Spread bruto", `+${op.spreadPct}%`, "#22c55e"],
                [`Taxa trade (${op.buyEx})`, `-$${(parseFloat(op.tradeFee) / 2).toFixed(4)}`, "#f87171"],
                [`Taxa trade (${op.sellEx})`, `-$${(parseFloat(op.tradeFee) / 2).toFixed(4)}`, "#f87171"],
                [`Rede (${op.net})`, `-$${op.netFee}`, "#fb923c"],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "5px 0", borderBottom: "1px solid #111d2e" }}>
                  <span style={{ fontSize: "11px", color: "#4a6080" }}>{l}</span>
                  <span style={{ fontSize: "11px", color: c, fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 20, paddingTop: 10 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#7aa0c0" }}>Lucro líquido</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#4ade80", fontFamily: "monospace" }}>+{op.profit} USDT</span>
              </div>
            </div>

            {/* Volume */}
            <div>
              <div style={{ fontSize: "10px", color: "#3a5070", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Volume 24h</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#60a5fa", fontFamily: "monospace" }}>${(op.vol / 1e6).toFixed(1)}M</div>
              <div style={{ fontSize: "10px", color: "#3a5070", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 12, marginBottom: 4 }}>Liquidez</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: op.liq ? "#4ade80" : "#fb923c" }}>{op.liq ? "✓ Suficiente" : "⚠ Atenção"}</div>
            </div>
          </div>
        )}

        {tab === "playbook" && (
          <div>
            {[
              { n: 1, title: "Prepare o capital", desc: `Tenha ${parseFloat(capital).toLocaleString("pt-BR")} USDT disponível na ${op.buyEx}.` },
              { n: 2, title: `Compre ${op.asset} na ${op.buyEx}", desc: `Ordem de compra a ~$${op.buyPrice}. Você receberá ~${op.units} ${op.asset}.` },
              { n: 3, title: `Transfira via ${op.net}", desc: `Rede ${op.net}. Taxa: ~$${op.netFee} USDT. Tempo: ${op.fast ? "< 30s" : "2–5 min"}.` },
              { n: 4, title: `Venda por USDT na ${op.sellEx}", desc: `Ordem de venda a ~$${op.sellPrice}.` },
              { n: 5, title: "Lucro confirmado", desc: `Saldo final: ${(parseFloat(capital) + parseFloat(op.profit)).toFixed(2)} USDT (+${op.profit} USDT líquido).` },
            ].map((s, i, arr) => (
              <div key={s.n} style={{ display: "flex", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#0d1526", border: "1px solid #1e3050", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#3b82f6", fontFamily: "monospace" }}>
                    {s.n}
                  </div>
                  {i < arr.length - 1 && <div style={{ width: 1, height: 28, background: "#1a2a40" }} />}
                </div>
                <div style={{ paddingBottom: i < arr.length - 1 ? 4 : 0, paddingTop: 2 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#93c5fd", marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: "11px", color: "#4a6080", lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function USDTInfinity() {
  const [capital, setCapital] = useState("1000");
  const [ops, setOps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scans, setScans] = useState(0);

  const refresh = useCallback(() => {
    const cap = parseFloat(capital) || 1000;
    setOps(genOps(cap));
    setScans((c) => c + 1);
    setSelId(null);
  }, [capital]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [capital]);

  const filtered = ops.filter((o) => {
    if (filter === "fast") return o.fast;
    if (filter === "positive") return parseFloat(o.profit) > 0 && o.liq;
    return true;
  });

  const best = ops.find((o) => parseFloat(o.profit) > 0 && o.liq);
  const activeCount = ops.filter((o) => parseFloat(o.profit) > 0 && o.liq).length;
  const cap = parseFloat(capital) || 1000;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #060d1a; color: #c0d4e8; font-family: 'Inter', sans-serif; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #1e3050; border-radius: 2px; }

        .fbtn {
          background: transparent; border: 1px solid #1a2a40; color: #3a5070;
          padding: 5px 14px; border-radius: 6px; cursor: pointer;
          font-size: 11px; font-weight: 600; font-family: 'Inter', sans-serif; transition: all 0.15s;
        }
        .fbtn.on { border-color: #2563eb; color: #60a5fa; background: #0d1a33; }
        .fbtn:hover:not(.on) { color: #6080a0; border-color: #243550; }

        .cinput {
          background: #0a1525; border: 1px solid #1e3050; color: #e2f0ff;
          font-family: monospace; font-size: 15px; font-weight: 700;
          padding: 6px 12px; border-radius: 7px; outline: none; width: 130px; text-align: right;
        }
        .cinput:focus { border-color: #2563eb; }

        .qbtn {
          background: transparent; border: 1px solid #111d2e; color: #2a4060;
          padding: 4px 9px; border-radius: 5px; cursor: pointer;
          font-size: 10px; font-family: monospace; font-weight: 700; transition: all 0.1s;
        }
        .qbtn.on { border-color: #1e3a60; color: #4a80b0; background: #0d1a2e; }
        .qbtn:hover:not(.on) { color: #3a6090; }

        .orow {
          display: flex; align-items: center;
          border-bottom: 1px solid #0d1828;
          cursor: pointer; transition: background 0.1s;
          padding: 13px 24px;
        }
        .orow:hover { background: #080f1e; }
        .orow.sel { background: #080f1e; border-left: 2px solid #2563eb; padding-left: 22px; }

        @keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .detail-anim { animation: slideDown 0.18s ease both; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#060d1a", borderBottom: "1px solid #0d1828", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", height: 52, gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "18px", color: "#2563eb" }}>∞</span>
            <span style={{ fontSize: "14px", fontWeight: 800, color: "#e2f0ff", letterSpacing: "-0.02em" }}>USDT Infinity</span>
          </div>
          <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
            {["Arbitragem BRL", "USDT Infinity"].map((item, i) => (
              <button key={item} style={{
                background: i === 1 ? "#0d1a33" : "transparent",
                border: i === 1 ? "1px solid #1e3050" : "1px solid transparent",
                color: i === 1 ? "#60a5fa" : "#2a4060",
                padding: "4px 12px", borderRadius: "6px", cursor: "pointer",
                fontSize: "12px", fontWeight: 600, fontFamily: "'Inter', sans-serif",
              }}>
                {item}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: "11px", color: "#2a4060", fontFamily: "monospace" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 6px #22c55e" }} />
            ao vivo · {scans} scans · {EXCHANGES.length} exchanges
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ background: "#060d1a", borderBottom: "1px solid #0d1828", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} className="cinput" />
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2a4060", fontFamily: "monospace" }}>USDT</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[500, 1000, 5000, 10000].map((v) => (
            <button key={v} className={`qbtn${parseFloat(capital) === v ? " on" : ""}`} onClick={() => setCapital(String(v))}>
              {v >= 1000 ? `${v / 1000}k` : v}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: "#0d1828" }} />
        <button className={`fbtn${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>Todos</button>
        <button className={`fbtn${filter === "positive" ? " on" : ""}`} onClick={() => setFilter("positive")}>Lucrativos</button>
        <button className={`fbtn${filter === "fast" ? " on" : ""}`} onClick={() => setFilter("fast")}>Redes rápidas</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 28 }}>
          {[
            { l: "Ativas", v: `${activeCount}/${ops.length}`, c: "#4ade80" },
            { l: "Melhor lucro", v: best ? `+${parseFloat(best.profit).toFixed(2)} USDT` : "—", c: "#60a5fa" },
            { l: "Ativo", v: best ? `${best.asset} · ${best.profitPct}%` : "—", c: "#a78bfa" },
          ].map((s) => (
            <div key={s.l}>
              <div style={{ fontSize: "10px", color: "#2a4060", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{s.l}</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: s.c, fontFamily: "monospace" }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 24px", borderBottom: "1px solid #0d1828", background: "#060d1a" }}>
        {[
          { l: "Par", w: 130 },
          { l: "Rota", flex: 1 },
          { l: "Rede", w: 120 },
          { l: "Spread", w: 80, right: true },
          { l: "Lucro líquido", w: 140, right: true },
          { l: "", w: 20 },
        ].map((col, i) => (
          <div key={i} style={{ fontSize: "10px", color: "#2a4060", textTransform: "uppercase", letterSpacing: "0.07em", width: col.w, flex: col.flex, textAlign: col.right ? "right" : "left", flexShrink: col.flex ? undefined : 0 }}>
            {col.l}
          </div>
        ))}
      </div>

      {/* Rows */}
      {filtered.length === 0 && (
        <div style={{ padding: "60px 24px", textAlign: "center", color: "#1e3050", fontSize: "13px" }}>
          Nenhuma oportunidade com os filtros selecionados.
        </div>
      )}

      {filtered.map((op) => {
        const profit = parseFloat(op.profit);
        const isPos = profit > 0;
        const isSel = selId === op.id;

        return (
          <div key={op.id}>
            <div className={`orow${isSel ? " sel" : ""}`} onClick={() => setSelId(isSel ? null : op.id)}>
              {/* Pair */}
              <div style={{ width: 130, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, color: "#e2f0ff", fontFamily: "monospace", fontSize: "13px" }}>{op.asset}</span>
                <span style={{ color: "#2a4060", fontSize: "11px" }}>/USDT</span>
                <div style={{ fontSize: "10px", color: "#1e3050", marginTop: 2 }}>{op.age}s atrás</div>
              </div>

              {/* Route */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px" }}>
                  <span style={{ color: "#7aa8d8" }}>{op.buyEx}</span>
                  <span style={{ color: "#1e3050", margin: "0 6px" }}>→</span>
                  <span style={{ color: "#7aa8d8" }}>{op.sellEx}</span>
                </div>
                <div style={{ fontSize: "10px", color: "#2a4060", marginTop: 2, fontFamily: "monospace" }}>
                  ${op.buyPrice} → ${op.sellPrice}
                </div>
              </div>

              {/* Network */}
              <div style={{ width: 120, flexShrink: 0 }}>
                <span style={{
                  fontSize: "10px", padding: "2px 8px", borderRadius: "4px",
                  background: `${op.netColor}15`, border: `1px solid ${op.netColor}40`,
                  color: op.netColor, fontFamily: "monospace", fontWeight: 700,
                }}>
                  {op.fast ? "⚡ " : ""}{op.net}
                </span>
                {!op.liq && <div style={{ fontSize: "9px", color: "#fb923c", marginTop: 3 }}>low liq</div>}
              </div>

              {/* Spread */}
              <div style={{ width: 80, textAlign: "right", fontFamily: "monospace", fontSize: "12px", color: "#4a7090", flexShrink: 0 }}>
                {op.spreadPct}%
              </div>

              {/* Profit */}
              <div style={{ width: 140, textAlign: "right", flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "14px", color: isPos ? "#4ade80" : "#1e3050" }}>
                  {isPos ? "+" : ""}{profit.toFixed(2)}
                </span>
                <span style={{ fontSize: "10px", color: "#2a4060", marginLeft: 3 }}>USDT</span>
                {isPos && <div style={{ fontSize: "10px", color: "#22c55e", marginTop: 2 }}>{op.profitPct}%</div>}
              </div>

              {/* Chevron */}
              <div style={{ width: 20, textAlign: "right", fontSize: "12px", color: "#1e3a60", flexShrink: 0 }}>
                {isSel ? "∧" : "∨"}
              </div>
            </div>

            {isSel && (
              <div className="detail-anim">
                <DetailRow op={op} capital={cap} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
