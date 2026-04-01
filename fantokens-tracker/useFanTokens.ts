"use client";
/**
 * useFanTokens.ts
 * Adicione este arquivo em: frontend/src/lib/useFanTokens.ts
 */
import { useState, useEffect, useCallback, useRef } from "react";

export interface ExchangePrice {
  label: string;
  flag: string;
  region: string;
  accepts_brl: boolean;
  pix: boolean;
  status: "ok" | "error";
  price_usd?: number;
  price_brl?: number;
}

export interface BestArb {
  buy_exchange: string;
  buy_exchange_label: string;
  sell_exchange: string;
  sell_exchange_label: string;
  buy_price: number;
  sell_price: number;
  spread_pct: number;
  profit_est_usd_per_100: number;
}

export interface FanToken {
  id: string;
  symbol: string;
  team: string;
  tier: 1 | 2 | 3 | 4;
  status: "ok" | "error";
  avg_price_usd?: number;
  exchanges?: Record<string, ExchangePrice>;
  best_arb?: BestArb;
  error?: string;
}

export interface FanTokenSummary {
  total: number;
  with_arbitrage: number;
  above_1_pct: number;
  above_3_pct: number;
  usd_brl: number;
  best_opportunity?: {
    symbol: string;
    team: string;
    spread_pct: number;
    buy_exchange: string;
    sell_exchange: string;
  };
}

export interface FanTokensResponse {
  timestamp: string;
  tokens: FanToken[];
  summary: FanTokenSummary;
}

const REFRESH_MS = 45_000;

export function useFanTokens() {
  const [data, setData] = useState<FanTokensResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fantokens");
      if (!res.ok) throw new Error("API error");
      const json: FanTokensResponse = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_MS / 1000);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
    timerRef.current = setInterval(fetchTokens, REFRESH_MS);
    countRef.current = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [fetchTokens]);

  const refresh = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchTokens().then(() => {
      timerRef.current = setInterval(fetchTokens, REFRESH_MS);
    });
  };

  return { data, loading, lastUpdated, countdown, refresh };
}
