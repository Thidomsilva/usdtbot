import React from "react";
import type { InfinityOpportunity } from "../lib/usdt-infinity";

export interface RecentOpportunity extends InfinityOpportunity {
  timestamp: number;
  expired: boolean;
}

export default function RecentOpportunitiesTable({ rows }: { rows: RecentOpportunity[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto mb-8">
      <table className="min-w-full border text-xs bg-white rounded-lg">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Ativo</th>
            <th className="p-2">Origem</th>
            <th className="p-2">Destino</th>
            <th className="p-2">Rede</th>
            <th className="p-2">Lucro (USDT)</th>
            <th className="p-2">Status</th>
            <th className="p-2">Quando</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((opp, idx) => (
            <tr key={idx} className={opp.expired ? "opacity-60" : ""}>
              <td className="p-2 font-bold">{opp.asset}</td>
              <td className="p-2 flex items-center gap-1">
                <img src={opp.fromLogo} alt={opp.fromExchange} className="w-5 h-5 rounded-full border" />
                {opp.fromExchange}
              </td>
              <td className="p-2 flex items-center gap-1">
                <img src={opp.toLogo} alt={opp.toExchange} className="w-5 h-5 rounded-full border" />
                {opp.toExchange}
              </td>
              <td className="p-2 flex items-center gap-1">
                <img src={opp.networkLogo} alt={opp.network} className="w-5 h-5 rounded-full border" />
                {opp.network}
              </td>
              <td className="p-2 text-green-700 font-semibold">+{opp.profit.toFixed(2)}</td>
              <td className="p-2">
                {opp.expired ? (
                  <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Expirada</span>
                ) : (
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Ativa</span>
                )}
              </td>
              <td className="p-2 text-gray-500">{new Date(opp.timestamp).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
