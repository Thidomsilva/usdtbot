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

export interface P2POffer {
  id: string;
  side: "buy" | "sell";
  price_brl: number;
  available_usdt: number;
  min_order_brl: number;
  max_order_brl: number;
  seller_name: string;
  month_orders: number;
  month_finish_rate: number;
  payment_methods: string[];
}

export interface P2PArbitrageOpportunity {
  buy_offer_id: string;
  sell_offer_id: string;
  buy_price_brl: number;
  sell_price_brl: number;
  gross_spread_pct: number;
  gross_spread_brl_per_1000: number;
  est_liquidity_usdt: number;
  executable_min_brl: number;
  executable_max_brl: number;
  buy_seller: string;
  sell_buyer: string;
  buy_payment_methods: string[];
  sell_payment_methods: string[];
}

export interface P2PArbitrageSummary {
  buy_count: number;
  sell_count: number;
  opportunities_count: number;
  best_buy_price_brl: number | null;
  best_sell_price_brl: number | null;
  gross_spread_pct: number;
  simulated_amount_brl: number;
  simulated_safety_buffer_pct: number;
  best_net_opportunity: {
    buy_offer_id: string;
    sell_offer_id: string;
    est_net_profit_brl: number;
    est_net_profit_pct: number;
  } | null;
}

export interface P2PArbitrageResponse {
  timestamp: string;
  source: string;
  fiat: string;
  asset: string;
  buy_offers: P2POffer[];
  sell_offers: P2POffer[];
  opportunities: P2PArbitrageOpportunity[];
  summary: P2PArbitrageSummary;
  warning?: string;
  error?: string;
}
