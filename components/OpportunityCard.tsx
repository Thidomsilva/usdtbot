import React from "react";

interface OpportunityCardProps {
  asset: string;
  fromExchange: string;
  fromLogo: string;
  toExchange: string;
  toLogo: string;
  ask: number;
  bid: number;
  network: string;
  networkLogo: string;
  fees: { buy: number; withdraw: number; sell: number };
  liquidity: number;
  profit: number;
  profitPercent: number;
  playbook: string[];
}

export default function OpportunityCard(props: OpportunityCardProps) {
  return (
    <div className="border rounded-lg p-4 shadow bg-white">
      <div className="flex items-center mb-2">
        <img src={props.fromLogo} alt={props.fromExchange} className="w-6 h-6 mr-2" />
        <span className="font-bold">{props.fromExchange}</span>
        <span className="mx-2">→</span>
        <img src={props.toLogo} alt={props.toExchange} className="w-6 h-6 mr-2" />
        <span className="font-bold">{props.toExchange}</span>
      </div>
      <div className="mb-2">
        <span className="font-semibold">Ativo:</span> {props.asset} <br />
        <span className="font-semibold">Rede:</span> <img src={props.networkLogo} alt={props.network} className="inline w-5 h-5 mr-1" /> {props.network}
      </div>
      <div className="mb-2 text-sm">
        <span className="font-semibold">Preço Ask:</span> {props.ask} | <span className="font-semibold">Preço Bid:</span> {props.bid}
      </div>
      <div className="mb-2 text-sm">
        <span className="font-semibold">Taxas:</span> Compra: {props.fees.buy} | Saque: {props.fees.withdraw} | Venda: {props.fees.sell} USDT
      </div>
      <div className="mb-2 text-sm">
        <span className="font-semibold">Liquidez:</span> {props.liquidity} USDT
      </div>
      <div className="mb-2 text-green-600 font-bold">
        Lucro estimado: +{props.profit.toFixed(2)} USDT
      </div>
      <ol className="list-decimal ml-5 text-xs text-gray-700">
        {props.playbook.map((step, idx) => (
          <li key={idx}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
