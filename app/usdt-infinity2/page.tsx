import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";

export default function UsdtInfinityPage() {
  const [opportunities, setOpportunities] = useState<InfinityOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [capital, setCapital] = useState(100);
  const [inputValue, setInputValue] = useState("100");

  async function fetchOpportunities(cap: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/fan-tokens?capital=${cap}`, { cache: "no-store" });
      const data = await res.json();
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
          profit: t.best_arb.profit_est_brl_per_100 ? t.best_arb.profit_est_brl_per_100 * (cap / 100) : 0,
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
    fetchOpportunities(capital);
  }, [capital]);

  function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(inputValue.replace(/[^\d.]/g, ""));
    if (!isNaN(val) && val > 0) {
      setCapital(val);
    }
  }

  return (
    <div className="w-full min-h-screen flex flex-col items-center bg-gradient-to-br from-blue-900 via-gray-950 to-gray-800 py-8 px-2">
      <div className="mb-4 w-full max-w-6xl flex items-center">
        <a href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-200 font-semibold px-4 py-2 rounded-lg bg-gray-800/70 border border-blue-700 shadow transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Voltar
        </a>
        <h1 className="ml-6 text-3xl md:text-4xl font-extrabold text-white drop-shadow flex-1">
          USDT Infinity <span className='font-normal'>– Arbitragem Cross-Exchange</span>
        </h1>
      </div>
      <p className="text-gray-300 mb-4 max-w-3xl text-center">Simule oportunidades de arbitragem entre exchanges globais. Informe o valor desejado para simular o lucro estimado.</p>

      <form onSubmit={handleSimulate} className="flex flex-col md:flex-row items-center gap-4 mb-6 bg-gray-800/80 rounded-xl p-6 shadow-lg w-full max-w-3xl">
        <label className="text-gray-200 font-semibold mr-2" htmlFor="capital">Valor para simulação (USDT):</label>
        <input
          id="capital"
          type="number"
          min={10}
          step={10}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="w-32 px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-lg shadow transition-all"
        >Simular</button>
      </form>

      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-10 w-full max-w-6xl">
        <div className="flex-1 bg-gray-900/80 rounded-xl p-4 shadow flex flex-col md:flex-row md:items-center gap-2">
          <span className="text-gray-400">Valor simulado:</span>
          <span className="text-2xl font-bold text-blue-400 font-mono">{capital} USDT</span>
        </div>
        {loading && <span className="text-blue-400 font-semibold animate-pulse block">Buscando oportunidades...</span>}
      </div>

      <div className="modernGrid w-full max-w-6xl">
        {(!loading && opportunities.length === 0) && (
          <div className="col-span-full text-center text-gray-400 bg-gray-900/70 rounded-lg p-8 shadow-inner">
            <div className="text-3xl mb-2">😕</div>
            <div>Nenhuma oportunidade encontrada para o valor informado.<br/>Tente outro valor ou aguarde novas oportunidades.</div>
          </div>
        )}
        {opportunities.map((opp, idx) => (
          <OpportunityCard key={idx} {...opp} capital={capital} />
        ))}
      </div>
    </div>
  );
}
