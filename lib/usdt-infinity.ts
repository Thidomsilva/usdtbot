// Módulo scanner USDT Infinity
// Busca oportunidades de arbitragem cross-exchange em USDT

export type InfinityOpportunity = {
  asset: string;
  fromExchange: string;
  fromLogo?: string;
  toExchange: string;
  toLogo?: string;
  ask: number;
  askCurrency?: "BRL" | "USDT";
  bid: number;
  bidCurrency?: "BRL" | "USDT";
  network: string;
  networkLogo?: string;
  fees: { buy: number; withdraw: number; sell: number };
  liquidity: number;
  profit: number;
  profitCurrency?: "BRL" | "USDT";
  profitPercent: number;
  playbook: string[];
  buyBookTop?: Array<{
    priceBrl: number;
    amount: number;
    notionalBrl: number;
    cumulativeNotionalBrl: number;
  }>;
  sellBookTop?: Array<{
    priceBrl: number;
    amount: number;
    notionalBrl: number;
    cumulativeNotionalBrl: number;
  }>;
  buyBookCoverageBrl?: number;
  sellBookCoverageBrl?: number;
  buyBookCurrency?: "BRL" | "USDT";
  sellBookCurrency?: "BRL" | "USDT";
  bookLevels?: number;
  fromExchangeId?: string;
  toExchangeId?: string;
  allExchangesBooks?: Array<{
    exchange: string;
    label: string;
    asks: Array<{
      priceBrl: number;
      amount: number;
      notionalBrl: number;
      cumulativeNotionalBrl: number;
    }>;
    bids: Array<{
      priceBrl: number;
      amount: number;
      notionalBrl: number;
      cumulativeNotionalBrl: number;
    }>;
    currency: "BRL" | "USDT";
    asksCoverage: number;
    bidsCoverage: number;
  }>;
};

export async function scanUsdtInfinityOpportunities({ capital }: { capital: number }): Promise<InfinityOpportunity[]> {
  // Busca oportunidades reais aproveitando a API interna de fan-tokens (que já faz book cross-exchange em USDT)
  // Usa URL absoluta para funcionar em produção (Vercel)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/fan-tokens`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const tokens = data.tokens as any[];
  if (!Array.isArray(tokens)) return [];

  // Redes baratas priorizadas
  const CHEAP_NETWORKS = ["BEP20", "Polygon", "Solana", "Arbitrum", "Optimism"];
  const NETWORK_LOGOS: Record<string, string> = {
    BEP20: "/logos/bep20.png",
    Polygon: "/logos/polygon.png",
    Solana: "/logos/solana.png",
    Arbitrum: "/logos/arbitrum.png",
    Optimism: "/logos/optimism.png",
    TRC20: "/logos/tron.png",
    ERC20: "/logos/ethereum.png",
  };
  const EXCHANGE_LOGOS: Record<string, string> = {
    binance: "/logos/binance.png",
    bybit: "/logos/bybit.png",
    okx: "/logos/okx.png",
    kucoin: "/logos/kucoin.png",
    bitget: "/logos/bitget.png",
    gate: "/logos/gate.png",
    kraken: "/logos/kraken.png",
    coinbase: "/logos/coinbase.png",
    bingx: "/logos/bingx.png",
  };

  // Para cada token, busca melhores oportunidades
  const opportunities: InfinityOpportunity[] = [];
  for (const token of tokens) {
    if (!token.exchanges || !Array.isArray(token.exchanges)) continue;
    // Filtra exchanges globais
    const globais = token.exchanges.filter((ex: any) => ["binance","bybit","okx","kucoin","bitget","gate"].includes(ex.exchange) && ex.status === "ok" && ex.ask_price_brl && ex.bid_price_brl);
    for (const from of globais) {
      for (const to of globais) {
        if (from.exchange === to.exchange) continue;
        // Redes em comum
        const fromNetworks = from.networks ?? [];
        const toNetworks = to.networks ?? [];
        const commonNetworks = fromNetworks.filter((n: string) => toNetworks.includes(n));
        if (commonNetworks.length === 0) continue;
        // Prioriza rede barata
        const bestNetwork = commonNetworks.find((n: string) => CHEAP_NETWORKS.includes(n)) || commonNetworks[0];
        // Taxas
        const buyFee = (from.buy_fee_pct ?? 0.2) / 100;
        const sellFee = (to.sell_fee_pct ?? 0.2) / 100;
        const withdrawFee = (from.withdraw_fee ?? 0.1); // TODO: ajustar por rede/token
        // Preços
        const ask = from.ask_price_brl;
        const bid = to.bid_price_brl;
        if (!ask || !bid || ask <= 0 || bid <= 0) continue;
        // Liquidez mínima
        const liquidity = Math.min(from.volume_24h_brl ?? 0, to.volume_24h_brl ?? 0) / ask;
        if (liquidity * ask < capital) continue;
        // Cálculo de lucro
        const assetBought = (capital / ask) * (1 - buyFee);
        const assetAfterTransfer = Math.max(assetBought - withdrawFee, 0);
        const usdtBack = assetAfterTransfer * bid * (1 - sellFee);
        const profit = usdtBack - capital;
        const profitPercent = profit / capital;
        if (profit <= 0) continue;
        opportunities.push({
          asset: token.symbol,
          fromExchange: from.label,
          fromLogo: EXCHANGE_LOGOS[from.exchange] || "",
          toExchange: to.label,
          toLogo: EXCHANGE_LOGOS[to.exchange] || "",
          ask,
          bid,
          network: bestNetwork,
          networkLogo: NETWORK_LOGOS[bestNetwork] || "",
          fees: {
            buy: Number((buyFee * capital).toFixed(4)),
            withdraw: withdrawFee,
            sell: Number((sellFee * capital).toFixed(4)),
          },
          liquidity: Math.floor(liquidity * ask),
          profit: Number(profit.toFixed(4)),
          profitPercent: Number((profitPercent * 100).toFixed(4)),
          playbook: [
            `Compre ${token.symbol} na ${from.label}`,
            `Envie via rede ${bestNetwork}`,
            `Venda por USDT na ${to.label}`,
          ],
        });
      }
    }
  }
  // Ordena por lucro
  return opportunities.sort((a, b) => b.profit - a.profit).slice(0, 30);
}
