export interface ExchangeData {
  status: "ok" | "error";
  label: string;
  pair: "USDT/BRL";
  pricing_mode?: "direct" | "fallback";
  source_pair?: string;
  warning?: string;
  price_brl?: number;
  volume_24h?: number;
  change_24h?: number;
  high_24h?: number;
  low_24h?: number;
  source_url?: string;
  error?: string;
}

export interface Summary {
  min: number;
  max: number;
  avg: number;
  spread_pct: number;
  min_exchange: string;
  max_exchange: string;
}

export interface PricesResponse {
  timestamp: string;
  ok_count: number;
  total_count: number;
  exchanges: Record<string, ExchangeData>;
  summary: Summary | null;
}
