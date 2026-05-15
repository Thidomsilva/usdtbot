"use client";
import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";


import type { InfinityOpportunity } from "../../lib/usdt-infinity";

export default function UsdtInfinityPage() {
  const [capital, setCapital] = useState(1000);
  const [opportunities, setOpportunities] = useState<InfinityOpportunity[]>([]);
  const [exchangeStatus, setExchangeStatus] = useState<ExchangeStatus[]>([]);
  const [recent, setRecent] = useState<RecentOpportunity[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchOpportunities(newCapital: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/usdt-infinity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: newCapital })
      });
      const data = await res.json();
      const found = data.opportunities || [];
      setOpportunities(found);
      // Atualiza tabela de recentes
      setRecent((prev) => {
        // Remove expiradas antigas (> 10 min)
        const now = Date.now();
        const filtered = prev.filter((opp) => now - opp.timestamp < 10 * 60 * 1000);
        // Marca como expirada se não está mais ativa
        const updated = filtered.map((opp) => ({ ...opp, expired: !found.some((o: any) => o.asset === opp.asset && o.fromExchange === opp.fromExchange && o.toExchange === opp.toExchange && Math.abs(o.profit - opp.profit) < 0.01) }));
        // Adiciona novas
        const newOnes: RecentOpportunity[] = found.map((o: any) => ({ ...o, timestamp: now, expired: false }));
        // Evita duplicatas exatas
        const all = [...updated];
        for (const n of newOnes) {
          if (!all.some((x) => x.asset === n.asset && x.fromExchange === n.fromExchange && x.toExchange === n.toExchange && Math.abs(x.profit - n.profit) < 0.01)) {
            all.push(n);
          }
        }
        // Ordena: ativas primeiro, depois por data
        return all.sort((a, b) => (a.expired === b.expired ? b.timestamp - a.timestamp : a.expired ? 1 : -1)).slice(0, 20);
      });

      // Buscar status das exchanges globais conectadas via /api/fan-tokens
      const fanRes = await fetch("/api/fan-tokens", { cache: "no-store" });
      if (fanRes.ok) {
        const fanData = await fanRes.json();
        const EXCHANGE_LOGOS: Record<string, string> = {
          binance: "/logos/binance.png",
          bybit: "/logos/bybit.png",
          okx: "/logos/okx.png",
          kucoin: "/logos/kucoin.png",
          bitget: "/logos/bitget.png",
          gate: "/logos/gate.png",
        };
        const globais = ["binance","bybit","okx","kucoin","bitget","gate"];
        const statusArr: ExchangeStatus[] = globais.map((id) => {
          const ex = (fanData.tokens?.[0]?.exchanges ?? []).find((e: any) => e.exchange === id);
          return {
            id,
            label: ex?.label || id.charAt(0).toUpperCase() + id.slice(1),
            logo: EXCHANGE_LOGOS[id] || "",
            online: !!ex && ex.status === "ok",
          };
        });
        setExchangeStatus(statusArr);
      }
    } catch (e) {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchOpportunities(capital);
    // eslint-disable-next-line
  }, [capital]);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">USDT Infinity – Arbitragem Cross-Exchange</h1>
      <ExchangeStatusGrid exchanges={exchangeStatus} />
      <RecentOpportunitiesTable rows={recent} />
      <div className="mb-6">
        <label className="block mb-2 font-semibold">Capital disponível (USDT):</label>
        <input
          type="number"
          value={capital}
          min={1}
          step={0.01}
          onChange={e => setCapital(Number(e.target.value))}
          className="border px-3 py-2 rounded w-48"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="text-gray-400">Buscando oportunidades...</div>
        ) : opportunities.length === 0 ? (
          <div className="text-gray-500">Nenhuma oportunidade encontrada.</div>
        ) : (
          opportunities.map((opp, idx) => (
            <OpportunityCard key={idx} {...opp} />
          ))
        )}
      </div>
    </div>
  );
}
