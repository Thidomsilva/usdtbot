"use client";
import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";


import type { InfinityOpportunity } from "../../lib/usdt-infinity";


export default function UsdtInfinityPage() {
  const [opportunities, setOpportunities] = useState<InfinityOpportunity[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchOpportunities() {
    setLoading(true);
    try {
      // Busca oportunidades sem filtro de capital
      const res = await fetch("/api/fan-tokens", { cache: "no-store" });
      const data = await res.json();
      // Monta oportunidades a partir do melhor spread de cada token
      const found = (data.tokens || [])
        .map((t: any) => t.best_arb && t.best_arb.spread_pct > 0 ? {
          asset: t.symbol,
          fromExchange: t.best_arb.buy_exchange_label,
          toExchange: t.best_arb.sell_exchange_label,
          ask: t.best_arb.buy_price_brl,
          bid: t.best_arb.sell_price_brl,
          network: "-",
          fees: { buy: t.best_arb.buy_fee_pct, withdraw: 0, sell: t.best_arb.sell_fee_pct },
          liquidity: 0,
          profit: t.best_arb.profit_est_brl_per_100 ?? 0,
          profitPercent: t.best_arb.net_spread_pct ?? 0,
          playbook: [
            `Comprar em ${t.best_arb.buy_exchange_label}`,
            `Vender em ${t.best_arb.sell_exchange_label}`,
          ],
        } : null)
        .filter(Boolean);
      setOpportunities(found);
    } catch (e) {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchOpportunities();
  }, []);

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <h1 className="text-3xl md:text-4xl font-extrabold mb-6 text-white drop-shadow">USDT Infinity <span className='font-normal'>– Arbitragem Cross-Exchange</span></h1>
      {/* <div className="mb-8">
        <ExchangeStatusGrid exchanges={exchangeStatus} />
      </div> */}
      {loading && <span className="text-blue-400 font-semibold animate-pulse block mb-8">Buscando oportunidades...</span>}
      <div className="mb-10">
        <RecentOpportunitiesTable rows={recent} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(!loading && opportunities.length === 0) && (
          <div className="col-span-full text-center text-gray-400 bg-gray-900/70 rounded-lg p-8 shadow-inner">
            <div className="text-2xl mb-2">😕</div>
            <div>Nenhuma oportunidade encontrada para o capital informado.<br/>Tente outro valor ou aguarde novas oportunidades.</div>
          </div>
        )}
        {opportunities.map((opp, idx) => (
          <OpportunityCard key={idx} {...opp} />
        ))}
      </div>
    </div>
  );
}
