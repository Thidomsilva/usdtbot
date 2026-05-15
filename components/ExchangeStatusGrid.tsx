import React from "react";

export interface ExchangeStatus {
  id: string;
  label: string;
  logo: string;
  online: boolean;
}

export default function ExchangeStatusGrid({ exchanges }: { exchanges: ExchangeStatus[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
      {exchanges.map((ex) => (
        <div key={ex.id} className={`flex items-center gap-2 p-3 rounded-lg border shadow-sm bg-white/80 ${ex.online ? 'border-green-400' : 'border-red-300 opacity-60'}`}>
          <img src={ex.logo} alt={ex.label} className="w-7 h-7 rounded-full border" />
          <span className="font-semibold text-sm">{ex.label}</span>
          <span className={`ml-auto text-xs px-2 py-1 rounded ${ex.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{ex.online ? 'online' : 'offline'}</span>
        </div>
      ))}
    </div>
  );
}
