import React from "react";

interface OpportunityCardProps {
  asset: string;
  fromExchange: string;
  fromLogo?: string;
  toExchange: string;
  toLogo?: string;
  ask: number;
  bid: number;
  network: string;
  networkLogo?: string;
  fees: { buy: number; withdraw: number; sell: number };
  liquidity: number;
  profit: number;
  profitPercent: number;
  playbook: string[];
  capital?: number;
}

export default function OpportunityCard(props: OpportunityCardProps) {
  return (
    <div className="rounded-2xl p-6 shadow-xl bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 border border-gray-700 flex flex-col gap-2 hover:scale-[1.025] transition-transform">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {props.fromLogo && <img src={props.fromLogo} alt={props.fromExchange} className="w-6 h-6 rounded-full bg-white" />}
          <span className="font-bold text-lg text-blue-400 drop-shadow">{props.fromExchange}</span>
        </div>
        <span className="mx-2 text-gray-400">→</span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-green-400 drop-shadow">{props.toExchange}</span>
          {props.toLogo && <img src={props.toLogo} alt={props.toExchange} className="w-6 h-6 rounded-full bg-white" />}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <span className="bg-gray-700 text-white px-2 py-1 rounded text-xs font-mono">{props.asset}</span>
        {props.network && <span className="bg-gray-700 text-gray-200 px-2 py-1 rounded text-xs flex items-center gap-1">Rede: {props.network} {props.networkLogo && <img src={props.networkLogo} alt={props.network} className="w-4 h-4 inline-block ml-1" />}</span>}
      </div>
      <div className="flex flex-wrap gap-2 text-sm mb-2">
        <span className="bg-blue-900/60 px-2 py-1 rounded">Ask: <span className="font-mono">{props.ask}</span></span>
        <span className="bg-green-900/60 px-2 py-1 rounded">Bid: <span className="font-mono">{props.bid}</span></span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs mb-2">
        <span className="bg-gray-900/60 px-2 py-1 rounded">Taxa compra: {props.fees.buy}%</span>
        <span className="bg-gray-900/60 px-2 py-1 rounded">Taxa saque: {props.fees.withdraw}%</span>
        <span className="bg-gray-900/60 px-2 py-1 rounded">Taxa venda: {props.fees.sell}%</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="bg-yellow-900/60 px-2 py-1 rounded text-xs">Liquidez: {props.liquidity} USDT</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-green-400 font-extrabold text-xl drop-shadow">+{props.profit.toFixed(2)} USDT</span>
        <span className="text-green-200 font-semibold text-sm">({props.profitPercent.toFixed(2)}%)</span>
        {props.capital && <span className="ml-auto bg-blue-900/40 px-2 py-1 rounded text-xs text-blue-300">Simulação: {props.capital} USDT</span>}
      </div>
      <ol className="list-decimal ml-5 text-xs text-gray-300 mt-2">
        {props.playbook.map((step, idx) => (
          <li key={idx}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
