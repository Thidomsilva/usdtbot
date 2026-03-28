"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { PricesResponse } from "./types";

const REFRESH_INTERVAL = 30_000; // 30 s

export function usePrices() {
  const [data, setData] = useState<PricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices");
      if (!res.ok) throw new Error("API error");
      const json: PricesResponse = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL);

    countRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [fetchPrices]);

  const refresh = () => {
    setLoading(true);
    if (timerRef.current) clearInterval(timerRef.current);
    fetchPrices().then(() => {
      timerRef.current = setInterval(fetchPrices, REFRESH_INTERVAL);
    });
  };

  return { data, loading, lastUpdated, countdown, refresh };
}
