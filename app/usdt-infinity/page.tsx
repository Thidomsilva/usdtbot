import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";

export default function UsdtInfinityPage() {
  const [capital, setCapital] = useState(1000);
  const [opportunities, setOpportunities] = useState([]);
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
      setOpportunities(data.opportunities || []);
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
