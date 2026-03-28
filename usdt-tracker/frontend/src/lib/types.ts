export interface ExchangeData {
  status: "ok" | "error";
  label: string;
  flag: string;
  pair?: string;
  price_usd?: number;
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
  exchanges: Record<string, ExchangeData>;
  summary: Summary;
}
