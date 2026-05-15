"use client";
import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";
import type { InfinityOpportunity } from "../../lib/usdt-infinity";

export default function UsdtInfinityPage() {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-900 via-gray-950 to-gray-800 py-8 px-2">
      <div className="bg-gray-900/90 rounded-xl p-10 shadow-lg flex flex-col items-center">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4">USDT Infinity</h1>
        <p className="text-gray-300 mb-6 text-center">Esta página está temporariamente indisponível enquanto realizamos melhorias no layout.<br/>Por favor, volte em breve!</p>
        <a href="/" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-200 font-semibold px-4 py-2 rounded-lg bg-gray-800/70 border border-blue-700 shadow transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Voltar
        </a>
      </div>
    </div>
  );
}
