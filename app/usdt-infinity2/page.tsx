"use client";
import React, { useState } from "react";
import OpportunityCard from "../../components/OpportunityCard";
import RecentOpportunitiesTable, { RecentOpportunity } from "../../components/RecentOpportunitiesTable";
import ExchangeStatusGrid, { ExchangeStatus } from "../../components/ExchangeStatusGrid";

import type { InfinityOpportunity } from "../../lib/usdt-infinity";

export default function UsdtInfinityPage() {
  return (
    <div style={{padding: 40, fontSize: 32, color: 'blue', fontWeight: 'bold'}}>
      TESTE USDT-INFINITY2 - {new Date().toISOString()}
    </div>
  );
}
