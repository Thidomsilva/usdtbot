import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 9_000;
const CACHE_TTL_MS = 2_000; // Cache curto para reduzir defasagem entre tela e mercado

type FxBase = "EUR" | "BRL";
type AssetSymbol =
  | "USDT"
  | "USDC"
  | "DAI"
  | "USDS"
  | "PYUSD"
  | "FDUSD"
  | "GUSD"
  | "USDP"
  | "RLUSD"
  | "USDR"
  | "EURC"
  | "EURR"
  | "BRLA"
  | "BRL1"
  | "BRZ"
  | "WBRL"
  | "PAXG"
  | "XAUT";
type QuoteAsset = "USD" | "BRL" | "EUR" | "XAU" | "USDT" | "USDC" | "DAI" | "BRLA" | "BRL1" | "BRZ";
type IdealType = "usd_peg" | "fx" | "cross_peg";
type DirectionMode = "all" | "buy_discount" | "sell_premium";

type MonitoredAsset = {
  id: string;
  label: string;
  symbol: AssetSymbol;
  pegReference: string;
  pegCurrency: "USD" | "BRL" | "EUR" | "XAU";
  coingeckoId: string;
  coinmarketcapSlug: string;
  defilamaSymbol?: string;
};

type PairConfig = {
  id: string;
  label: string;
  symbol: string;
  baseAsset: AssetSymbol;
  quoteAsset: QuoteAsset;
  pegReference: string;
  gateSymbol: string;
  kucoinSymbol: string;
  okxInstId: string;
  coinexMarket: string;
  bybitSymbol: string;
  htxSymbol: string;
  krakenSymbol: string;
  coinbaseSymbol: string;
  coingeckoId: string;
  coinmarketcapSlug: string;
  idealType: IdealType;
  fxBase?: FxBase;
  priceMode?: "market" | "defillama_ratio";
  displayBrl?: boolean;
  disableAggregatorFallback?: boolean;
  defilamaSymbol?: string; // ID alternativo para DefiLlama (ex: ethereum:0x...)
};

type TickerResult = {
  bid: number;
  ask: number;
  mid: number;
  source: string;
};

type DepegRow = {
  id: string;
  label: string;
  symbol: string;
  quote_asset: QuoteAsset;
  status: "ok" | "unavailable";
  analyzed_on: string;
  peg_reference: string;
  market_price: number | null;
  market_price_brl: number | null;
  bid_price: number | null;
  ask_price: number | null;
  orderbook_spread_pct: number | null;
  ideal_price: number | null;
  ideal_price_brl: number | null;
  depeg_pct: number | null;
  asymmetry_pct: number | null;
  direction: "above_peg" | "below_peg";
  severity: "low" | "medium" | "high";
  signal: "watch" | "opportunity" | "stress";
  notes: string;
};

type DepegContractRow = DepegRow & {
  asset_id: string;
  network: string;
  contract: string;
  contract_symbol: string | null;
};

type DepegResponse = {
  timestamp: string;
  source: string;
  threshold_pct: number;
  usd_brl: number | null;
  monitored_rows: DepegRow[];
  contract_rows: DepegContractRow[];
  opportunities: DepegRow[];
  summary: {
    monitored_pairs: number;
    above_threshold: number;
    max_asymmetry_pct: number;
    best_opportunity:
      | (Pick<DepegRow, "id" | "label" | "depeg_pct" | "asymmetry_pct" | "direction" | "signal"> & {
          net_margin_pct: number | null;
        })
      | null;
  };
  warning?: string;
  error?: string;
};

type ContractFeed = {
  assetId: string;
  network: string;
  contract: string;
};

type CacheEntry = {
  expiresAt: number;
  payload: DepegResponse;
};

const cache = new Map<string, CacheEntry>();

const ASSET_METADATA: Partial<Record<AssetSymbol, { coingeckoId: string; coinmarketcapSlug: string }>> = {
  USDT: { coingeckoId: "tether", coinmarketcapSlug: "tether" },
  USDC: { coingeckoId: "usd-coin", coinmarketcapSlug: "usd-coin" },
  DAI: { coingeckoId: "dai", coinmarketcapSlug: "multi-collateral-dai" },
  BRLA: { coingeckoId: "brla-digital-brla", coinmarketcapSlug: "brla-digital-brl" },
  BRL1: { coingeckoId: "brl1", coinmarketcapSlug: "brl1" },
  BRZ: { coingeckoId: "brz", coinmarketcapSlug: "brz" },
};

const MONITORED_ASSETS: MonitoredAsset[] = [
  {
    id: "usdt",
    label: "USDT",
    symbol: "USDT",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "tether",
    coinmarketcapSlug: "tether",
  },
  {
    id: "usdc",
    label: "USDC",
    symbol: "USDC",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "usd-coin",
    coinmarketcapSlug: "usd-coin",
  },
  {
    id: "dai",
    label: "DAI",
    symbol: "DAI",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
  },
  {
    id: "usds",
    label: "USDS",
    symbol: "USDS",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "usds",
    coinmarketcapSlug: "usds",
  },
  {
    id: "pyusd",
    label: "PYUSD",
    symbol: "PYUSD",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "paypal-usd",
    coinmarketcapSlug: "paypal-usd",
  },
  {
    id: "fdusd",
    label: "FDUSD",
    symbol: "FDUSD",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "first-digital-usd",
    coinmarketcapSlug: "first-digital-usd",
  },
  {
    id: "gusd",
    label: "GUSD",
    symbol: "GUSD",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "gemini-dollar",
    coinmarketcapSlug: "gemini-dollar",
  },
  {
    id: "usdp",
    label: "USDP",
    symbol: "USDP",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "pax-dollar",
    coinmarketcapSlug: "usdp",
  },
  {
    id: "rlusd",
    label: "RLUSD",
    symbol: "RLUSD",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "ripple-usd",
    coinmarketcapSlug: "ripple-usd",
  },
  {
    id: "usdr",
    label: "USDR",
    symbol: "USDR",
    pegReference: "USD stablecoin (1:1)",
    pegCurrency: "USD",
    coingeckoId: "stablr-usd",
    coinmarketcapSlug: "stablr-usd",
  },
  {
    id: "eurc",
    label: "EURC",
    symbol: "EURC",
    pegReference: "EUR stablecoin (1:1)",
    pegCurrency: "EUR",
    coingeckoId: "euro-coin",
    coinmarketcapSlug: "euro-coin",
  },
  {
    id: "eurr",
    label: "EURR",
    symbol: "EURR",
    pegReference: "EUR stablecoin (1:1)",
    pegCurrency: "EUR",
    coingeckoId: "stablr-euro",
    coinmarketcapSlug: "stablr-euro",
  },
  {
    id: "brla",
    label: "BRLA",
    symbol: "BRLA",
    pegReference: "BRL stablecoin (1:1)",
    pegCurrency: "BRL",
    coingeckoId: "brla-digital-brla",
    coinmarketcapSlug: "brla-digital-brl",
    defilamaSymbol: "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb",
  },
  {
    id: "brl1",
    label: "BRL1",
    symbol: "BRL1",
    pegReference: "BRL stablecoin (1:1)",
    pegCurrency: "BRL",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    defilamaSymbol: "polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
  },
  {
    id: "brz",
    label: "BRZ",
    symbol: "BRZ",
    pegReference: "BRL stablecoin (1:1)",
    pegCurrency: "BRL",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    defilamaSymbol: "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc",
  },
  {
    id: "wbrl",
    label: "WBRL",
    symbol: "WBRL",
    pegReference: "BRL stablecoin (1:1)",
    pegCurrency: "BRL",
    coingeckoId: "brazilian-real",
    coinmarketcapSlug: "wrapped-brazilian-real",
  },
  {
    id: "paxg",
    label: "PAXG",
    symbol: "PAXG",
    pegReference: "Gold token (1 troy oz)",
    pegCurrency: "XAU",
    coingeckoId: "pax-gold",
    coinmarketcapSlug: "pax-gold",
  },
  {
    id: "xaut",
    label: "XAUT",
    symbol: "XAUT",
    pegReference: "Gold token (1 troy oz)",
    pegCurrency: "XAU",
    coingeckoId: "tether-gold",
    coinmarketcapSlug: "tether-gold",
  },
];

const CONTRACT_FEEDS: ContractFeed[] = [
  { assetId: "usdt", network: "Ethereum", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  { assetId: "usdt", network: "Tron", contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
  { assetId: "usdt", network: "BSC", contract: "0x55d398326f99059ff775485246999027b3197955" },
  { assetId: "usdt", network: "Polygon", contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
  { assetId: "usdt", network: "Arbitrum", contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" },
  { assetId: "usdt", network: "Avalanche", contract: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7" },
  { assetId: "usdc", network: "Ethereum", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { assetId: "usdc", network: "Solana", contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { assetId: "usdc", network: "BSC", contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" },
  { assetId: "usdc", network: "Polygon", contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
  { assetId: "usdc", network: "Arbitrum", contract: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  { assetId: "usdc", network: "Base", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
  { assetId: "usdc", network: "Avalanche", contract: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e" },
  { assetId: "dai", network: "Ethereum", contract: "0x6b175474e89094c44da98b954eedeac495271d0f" },
  { assetId: "usds", network: "Ethereum", contract: "0xdc035d45d973e3ec169d2276ddab16f1e407384f" },
  { assetId: "usds", network: "Solana", contract: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA" },
  { assetId: "pyusd", network: "Ethereum", contract: "0x6c3ea9036406852006290770bedfcaba0e23a0e8" },
  { assetId: "pyusd", network: "Solana", contract: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" },
  { assetId: "fdusd", network: "Ethereum", contract: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409" },
  { assetId: "fdusd", network: "BSC", contract: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409" },
  { assetId: "fdusd", network: "Arbitrum", contract: "0x93c9932e4afa59201f0b5e63f7d816516f1669fe" },
  { assetId: "fdusd", network: "Solana", contract: "9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u" },
  { assetId: "gusd", network: "Ethereum", contract: "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd" },
  { assetId: "usdp", network: "Ethereum", contract: "0x8e870d67f660d95d5be530380d0ec0bd388289e1" },
  { assetId: "rlusd", network: "Ethereum", contract: "0x8292bb45bf1ee4d140127049757c2e0ff06317ed" },
  { assetId: "usdr", network: "Ethereum", contract: "0x7b43e3875440b44613dc3bc08e7763e6da63c8f8" },
  { assetId: "eurc", network: "Ethereum", contract: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c" },
  { assetId: "eurc", network: "Solana", contract: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" },
  { assetId: "eurr", network: "Ethereum", contract: "0x50753cfaf86c094925bf976f218d043f8791e408" },
  { assetId: "brz", network: "Ethereum", contract: "0x01d33fd36ec67c6ada32cf36b31e88ee190b1839" },
  { assetId: "brz", network: "Polygon", contract: "0x4ed141110f6d2506c98d1f86ca92d2b1577c9275" },
  { assetId: "brz", network: "BSC", contract: "0x71be881e9c5d4465b3fff61e89c6f3651e69b5bb" },
  { assetId: "brz", network: "Arbitrum", contract: "0xa8940698fda5a07abaef4a5ccdf2f1bb525b47a2" },
  { assetId: "brz", network: "Avalanche", contract: "0x491a4eb4f1fc3bff8e1d2fc856a6a46663ad556f" },
  { assetId: "brl1", network: "Polygon", contract: "0x5c067c80c00ecd2345b05e83a3e758ef799c40b5" },
  { assetId: "brla", network: "Polygon", contract: "0xe6a537a407488807f0bbeb0038b79004f19dddfb" },
  { assetId: "paxg", network: "Ethereum", contract: "0x45804880de22913dafe09f4980848ece6ecbaf78" },
  { assetId: "xaut", network: "Ethereum", contract: "0x68749665ff8d2d112fa859aa293f07a622782f38" },
];

const PAIRS: PairConfig[] = [
  {
    id: "usdt-usdc",
    label: "USDT x USDC",
    symbol: "USDTUSDC",
    baseAsset: "USDT",
    quoteAsset: "USDC",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDT_USDC",
    kucoinSymbol: "USDT-USDC",
    okxInstId: "USDT-USDC",
    coinexMarket: "USDTUSDC",
    bybitSymbol: "USDTUSDC",
    htxSymbol: "usdtusdc",
    krakenSymbol: "USDTUSDC",
    coinbaseSymbol: "USDT-USDC",
    coingeckoId: "tether",
    coinmarketcapSlug: "tether",
    idealType: "cross_peg",
  },
  {
    id: "usdt-dai",
    label: "USDT x DAI",
    symbol: "USDTDAI",
    baseAsset: "USDT",
    quoteAsset: "DAI",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDT_DAI",
    kucoinSymbol: "USDT-DAI",
    okxInstId: "USDT-DAI",
    coinexMarket: "USDTDAI",
    bybitSymbol: "USDTDAI",
    htxSymbol: "usdtdai",
    krakenSymbol: "USDTDAI",
    coinbaseSymbol: "USDT-DAI",
    coingeckoId: "tether",
    coinmarketcapSlug: "tether",
    idealType: "cross_peg",
  },
  {
    id: "usdc-usdt",
    label: "USDC x USDT",
    symbol: "USDCUSDT",
    baseAsset: "USDC",
    quoteAsset: "USDT",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDC_USDT",
    kucoinSymbol: "USDC-USDT",
    okxInstId: "USDC-USDT",
    coinexMarket: "USDCUSDT",
    bybitSymbol: "USDCUSDT",
    htxSymbol: "usdcusdt",
    krakenSymbol: "USDCUSDT",
    coinbaseSymbol: "USDC-USDT",
    coingeckoId: "usd-coin",
    coinmarketcapSlug: "usd-coin",
    idealType: "cross_peg",
  },
  {
    id: "usdc-dai",
    label: "USDC x DAI",
    symbol: "USDCDAI",
    baseAsset: "USDC",
    quoteAsset: "DAI",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "USDC_DAI",
    kucoinSymbol: "USDC-DAI",
    okxInstId: "USDC-DAI",
    coinexMarket: "USDCDAI",
    bybitSymbol: "USDCDAI",
    htxSymbol: "usdcdai",
    krakenSymbol: "USDCDAI",
    coinbaseSymbol: "USDC-DAI",
    coingeckoId: "usd-coin",
    coinmarketcapSlug: "usd-coin",
    idealType: "cross_peg",
  },
  {
    id: "dai-usdt",
    label: "DAI x USDT",
    symbol: "DAIUSDT",
    baseAsset: "DAI",
    quoteAsset: "USDT",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "DAI_USDT",
    kucoinSymbol: "DAI-USDT",
    okxInstId: "DAI-USDT",
    coinexMarket: "DAIUSDT",
    bybitSymbol: "DAIUSDT",
    htxSymbol: "daiusdt",
    krakenSymbol: "DAIUSDT",
    coinbaseSymbol: "DAI-USDT",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
    idealType: "cross_peg",
  },
  {
    id: "dai-usdc",
    label: "DAI x USDC",
    symbol: "DAIUSDC",
    baseAsset: "DAI",
    quoteAsset: "USDC",
    pegReference: "USD stablecoin (1:1)",
    gateSymbol: "DAI_USDC",
    kucoinSymbol: "DAI-USDC",
    okxInstId: "DAI-USDC",
    coinexMarket: "DAIUSDC",
    bybitSymbol: "DAIUSDC",
    htxSymbol: "daiusdc",
    krakenSymbol: "DAIUSDC",
    coinbaseSymbol: "DAI-USDC",
    coingeckoId: "dai",
    coinmarketcapSlug: "multi-collateral-dai",
    idealType: "cross_peg",
  },
  {
    id: "brla-brl1",
    label: "BRLA x BRL1",
    symbol: "BRLABRL1",
    baseAsset: "BRLA",
    quoteAsset: "BRL1",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRLA_BRL1",
    kucoinSymbol: "BRLA-BRL1",
    okxInstId: "BRLA-BRL1",
    coinexMarket: "BRLABRL1",
    bybitSymbol: "BRLABRL1",
    htxSymbol: "brlabrl1",
    krakenSymbol: "BRLABRL1",
    coinbaseSymbol: "BRLA-BRL1",
    coingeckoId: "brla-digital-brla",
    coinmarketcapSlug: "brla-digital-brl",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb,polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
  },
  {
    id: "brla-brz",
    label: "BRLA x BRZ",
    symbol: "BRLABRZ",
    baseAsset: "BRLA",
    quoteAsset: "BRZ",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRLA_BRZ",
    kucoinSymbol: "BRLA-BRZ",
    okxInstId: "BRLA-BRZ",
    coinexMarket: "BRLABRZ",
    bybitSymbol: "BRLABRZ",
    htxSymbol: "brlabrz",
    krakenSymbol: "BRLABRZ",
    coinbaseSymbol: "BRLA-BRZ",
    coingeckoId: "brla-digital-brla",
    coinmarketcapSlug: "brla-digital-brl",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb,polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc",
  },
  {
    id: "brz-brla",
    label: "BRZ x BRLA",
    symbol: "BRZBRLA",
    baseAsset: "BRZ",
    quoteAsset: "BRLA",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRZ_BRLA",
    kucoinSymbol: "BRZ-BRLA",
    okxInstId: "BRZ-BRLA",
    coinexMarket: "BRZBRLA",
    bybitSymbol: "BRZBRLA",
    htxSymbol: "brzbrla",
    krakenSymbol: "BRZBRLA",
    coinbaseSymbol: "BRZ-BRLA",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc,polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb",
  },
  {
    id: "brz-brl1",
    label: "BRZ x BRL1",
    symbol: "BRZBRL1",
    baseAsset: "BRZ",
    quoteAsset: "BRL1",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRZ_BRL1",
    kucoinSymbol: "BRZ-BRL1",
    okxInstId: "BRZ-BRL1",
    coinexMarket: "BRZBRL1",
    bybitSymbol: "BRZBRL1",
    htxSymbol: "brzbrl1",
    krakenSymbol: "BRZBRL1",
    coinbaseSymbol: "BRZ-BRL1",
    coingeckoId: "brz",
    coinmarketcapSlug: "brz",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc,polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5",
  },
  {
    id: "brl1-brz",
    label: "BRL1 x BRZ",
    symbol: "BRL1BRZ",
    baseAsset: "BRL1",
    quoteAsset: "BRZ",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRL1_BRZ",
    kucoinSymbol: "BRL1-BRZ",
    okxInstId: "BRL1-BRZ",
    coinexMarket: "BRL1BRZ",
    bybitSymbol: "BRL1BRZ",
    htxSymbol: "brl1brz",
    krakenSymbol: "BRL1BRZ",
    coinbaseSymbol: "BRL1-BRZ",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5,polygon:0x4ed141110f6eeeaba9a1df36d8c26f684d2475dc",
  },
  {
    id: "brl1-brla",
    label: "BRL1 x BRLA",
    symbol: "BRL1BRLA",
    baseAsset: "BRL1",
    quoteAsset: "BRLA",
    pegReference: "BRL stablecoin (1:1)",
    gateSymbol: "BRL1_BRLA",
    kucoinSymbol: "BRL1-BRLA",
    okxInstId: "BRL1-BRLA",
    coinexMarket: "BRL1BRLA",
    bybitSymbol: "BRL1BRLA",
    htxSymbol: "brl1brla",
    krakenSymbol: "BRL1BRLA",
    coinbaseSymbol: "BRL1-BRLA",
    coingeckoId: "brl1",
    coinmarketcapSlug: "brl1",
    idealType: "cross_peg",
    defilamaSymbol: "polygon:0x5c067c80c00ecd2345b05e83a3e758ef799c40b5,polygon:0xe6a537a407488807f0bbeb0038b79004f19dddfb",
  },
];

function fallbackRows(reason: string): DepegRow[] {
  return MONITORED_ASSETS.map((asset) => {
    return {
      id: asset.id,
      label: asset.label,
      symbol: `${asset.symbol}/${asset.pegCurrency}`,
      quote_asset: asset.pegCurrency,
      status: "unavailable",
      analyzed_on: "CoinGecko/CoinMarketCap/DefiLlama",
      peg_reference: asset.pegReference,
      market_price: null,
      market_price_brl: null,
      bid_price: null,
      ask_price: null,
      orderbook_spread_pct: null,
      ideal_price: 1,
      ideal_price_brl: null,
      depeg_pct: null,
      asymmetry_pct: null,
      direction: "below_peg",
      severity: "low",
      signal: "watch",
      notes: reason,
    };
  });
}

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositive(value: string | null, fallback: number): number {
  const parsed = toNum(value);
  if (parsed < 0) return fallback;
  return parsed;
}

function parseDirectionMode(value: string | null): DirectionMode {
  if (value === "buy_discount") return "buy_discount";
  if (value === "sell_premium") return "sell_premium";
  return "all";
}

function normalizeError(err: unknown): string {
  const msg = String(err ?? "Erro desconhecido");
  const lower = msg.toLowerCase();
  if (lower.includes("market") && lower.includes("not found")) return "Mercado nao listado";
  if (lower.includes("instrument") && lower.includes("doesn't exist")) return "Mercado nao listado";
  if (lower.includes("invalid symbol")) return "Mercado nao listado";
  if (msg.toLowerCase().includes("restricted location")) return "Indisponivel na regiao atual";
  if (msg.toLowerCase().includes("eligibility")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 451")) return "Indisponivel na regiao atual";
  if (msg.includes("HTTP 403")) return "Bloqueado para esta regiao";
  if (msg.toLowerCase().includes("timeout")) return "Timeout na consulta";
  return msg;
}

function toDefiLlamaChain(network: string): string | null {
  const value = network.toLowerCase();
  if (value.includes("ethereum")) return "ethereum";
  if (value.includes("bsc") || value.includes("bnb")) return "bsc";
  if (value.includes("polygon")) return "polygon";
  if (value.includes("arbitrum")) return "arbitrum";
  if (value.includes("avalanche")) return "avax";
  if (value.includes("base")) return "base";
  if (value.includes("gnosis")) return "gnosis";
  if (value.includes("solana")) return "solana";
  if (value.includes("tron")) return "tron";
  return null;
}

function toDefiLlamaSymbolFromContract(network: string, contract: string): string | null {
  const chain = toDefiLlamaChain(network);
  if (!chain) return null;

  const trimmed = contract.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("0x") && trimmed.length === 42) {
    return `${chain}:${trimmed.toLowerCase()}`;
  }

  // Solana/Tron and other non-EVM formats
  if (/^[A-Za-z0-9]{24,}$/.test(trimmed)) {
    return `${chain}:${trimmed}`;
  }

  return null;
}

async function buildContractRows(ctx: PricingContext): Promise<DepegContractRow[]> {
  const assetsById = new Map(MONITORED_ASSETS.map((asset) => [asset.id, asset]));

  const rows = await Promise.all(
    CONTRACT_FEEDS.map(async (feed) => {
      const asset = assetsById.get(feed.assetId);
      if (!asset) return null;

      const contractSymbol = toDefiLlamaSymbolFromContract(feed.network, feed.contract);
      if (!contractSymbol) {
        return {
          id: `${asset.id}:${feed.network}`,
          asset_id: asset.id,
          network: feed.network,
          contract: feed.contract,
          contract_symbol: null,
          label: asset.label,
          symbol: `${asset.symbol}/${asset.pegCurrency}`,
          quote_asset: asset.pegCurrency,
          status: "unavailable",
          analyzed_on: "DefiLlama",
          peg_reference: asset.pegReference,
          market_price: null,
          market_price_brl: null,
          bid_price: null,
          ask_price: null,
          orderbook_spread_pct: null,
          ideal_price: 1,
          ideal_price_brl: toBrlDisplay(1, asset.pegCurrency, ctx),
          depeg_pct: null,
          asymmetry_pct: null,
          direction: "below_peg",
          severity: "low",
          signal: "watch",
          notes: "Contrato sem simbolo compativel para consulta por endereco.",
        } as DepegContractRow;
      }

      try {
        const ticker = await fetchTickerDefiLlama(asset.coingeckoId, contractSymbol);
        if (!ticker || ticker.mid <= 0) {
          return {
            id: `${asset.id}:${feed.network}`,
            asset_id: asset.id,
            network: feed.network,
            contract: feed.contract,
            contract_symbol: contractSymbol,
            label: asset.label,
            symbol: `${asset.symbol}/${asset.pegCurrency}`,
            quote_asset: asset.pegCurrency,
            status: "unavailable",
            analyzed_on: "DefiLlama",
            peg_reference: asset.pegReference,
            market_price: null,
            market_price_brl: null,
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: 1,
            ideal_price_brl: toBrlDisplay(1, asset.pegCurrency, ctx),
            depeg_pct: null,
            asymmetry_pct: null,
            direction: "below_peg",
            severity: "low",
            signal: "watch",
            notes: "Sem preco por contrato retornado pela DefiLlama neste ciclo.",
          } as DepegContractRow;
        }

        const marketPriceInPeg = toPegPriceFromUsd(ticker.mid, asset.pegCurrency, ctx);
        if (marketPriceInPeg <= 0) {
          return {
            id: `${asset.id}:${feed.network}`,
            asset_id: asset.id,
            network: feed.network,
            contract: feed.contract,
            contract_symbol: contractSymbol,
            label: asset.label,
            symbol: `${asset.symbol}/${asset.pegCurrency}`,
            quote_asset: asset.pegCurrency,
            status: "unavailable",
            analyzed_on: `DefiLlama (${feed.network})`,
            peg_reference: asset.pegReference,
            market_price: null,
            market_price_brl: null,
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: 1,
            ideal_price_brl: toBrlDisplay(1, asset.pegCurrency, ctx),
            depeg_pct: null,
            asymmetry_pct: null,
            direction: "below_peg",
            severity: "low",
            signal: "watch",
            notes: "Preco USD valido, mas sem referencia de conversao para moeda do peg.",
          } as DepegContractRow;
        }

        const depegPct = ((marketPriceInPeg - 1) / 1) * 100;
        const asymmetryPct = Math.abs(depegPct);
        const direction: DepegContractRow["direction"] = depegPct >= 0 ? "above_peg" : "below_peg";
        const { severity, signal } = classify(asymmetryPct);

        return {
          id: `${asset.id}:${feed.network}`,
          asset_id: asset.id,
          network: feed.network,
          contract: feed.contract,
          contract_symbol: contractSymbol,
          label: asset.label,
          symbol: `${asset.symbol}/${asset.pegCurrency}`,
          quote_asset: asset.pegCurrency,
          status: "ok",
          analyzed_on: `DefiLlama (${feed.network})`,
          peg_reference: asset.pegReference,
          market_price: Number(marketPriceInPeg.toFixed(6)),
          market_price_brl: toBrlDisplay(marketPriceInPeg, asset.pegCurrency, ctx),
          bid_price: null,
          ask_price: null,
          orderbook_spread_pct: null,
          ideal_price: 1,
          ideal_price_brl: toBrlDisplay(1, asset.pegCurrency, ctx),
          depeg_pct: Number(depegPct.toFixed(4)),
          asymmetry_pct: Number(asymmetryPct.toFixed(4)),
          direction,
          severity,
          signal,
          notes: "Monitoramento por contrato/rede via DefiLlama.",
        } as DepegContractRow;
      } catch (err) {
        return {
          id: `${asset.id}:${feed.network}`,
          asset_id: asset.id,
          network: feed.network,
          contract: feed.contract,
          contract_symbol: contractSymbol,
          label: asset.label,
          symbol: `${asset.symbol}/${asset.pegCurrency}`,
          quote_asset: asset.pegCurrency,
          status: "unavailable",
          analyzed_on: `DefiLlama (${feed.network})`,
          peg_reference: asset.pegReference,
          market_price: null,
          market_price_brl: null,
          bid_price: null,
          ask_price: null,
          orderbook_spread_pct: null,
          ideal_price: 1,
          ideal_price_brl: toBrlDisplay(1, asset.pegCurrency, ctx),
          depeg_pct: null,
          asymmetry_pct: null,
          direction: "below_peg",
          severity: "low",
          signal: "watch",
          notes: `Falha na consulta por contrato: ${normalizeError(err)}`,
        } as DepegContractRow;
      }
    })
  );

  return rows.filter((row): row is DepegContractRow => row !== null);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      accept: "application/json",
      "user-agent": "usdtbot-depeg/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchTickerBinance(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}`);

  const apiMsg = String(data?.msg ?? "");
  if (apiMsg) {
    throw new Error(apiMsg);
  }

  const bid = toNum(data?.bidPrice);
  const ask = toNum(data?.askPrice);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Binance Spot BookTicker" };
}

async function fetchTickerGate(currencyPair: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${currencyPair}`);
  const first = Array.isArray(data) ? data[0] : null;
  const bid = toNum(first?.highest_bid);
  const ask = toNum(first?.lowest_ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Gate Spot Ticker" };
}

async function fetchTickerKucoin(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${symbol}`);
  const payload = data?.data;
  const bid = toNum(payload?.bestBid);
  const ask = toNum(payload?.bestAsk);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "KuCoin Spot Level1" };
}

async function fetchTickerOkx(instId: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
  const code = String(data?.code ?? "");
  if (code && code !== "0") {
    throw new Error(String(data?.msg ?? "Erro na consulta da OKX"));
  }

  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const bid = toNum(first?.bidPx);
  const ask = toNum(first?.askPx);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "OKX Spot Ticker" };
}

async function fetchTickerCoinex(market: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.coinex.com/v2/spot/ticker?market=${market}`);
  const code = toNum(data?.code);
  if (code !== 0) {
    throw new Error(String(data?.message ?? "Erro na consulta da CoinEx"));
  }

  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const bid = toNum(first?.bid);
  const ask = toNum(first?.ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "CoinEx Spot Ticker" };
}

async function fetchTickerBybit(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
  const first = Array.isArray(data?.result?.list) ? data.result.list[0] : null;
  const bid = toNum(first?.bid1Price);
  const ask = toNum(first?.ask1Price);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Bybit Spot Ticker" };
}

async function fetchTickerHtx(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.huobi.pro/market/detail?symbol=${symbol}`);
  const tick = data?.tick;
  if (!tick) {
    throw new Error("HTX ticker nao encontrado");
  }

  const bid = toNum(tick?.bid?.[0]);
  const ask = toNum(tick?.ask?.[0]);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "HTX Spot Ticker" };
}

async function fetchTickerKraken(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`);
  if (data?.error && data.error.length > 0) {
    throw new Error(String(data.error[0]));
  }

  const key = Object.keys(data?.result ?? {})[0];
  if (!key) {
    return null;
  }

  const ticker = data.result[key];
  const bid = toNum(ticker?.b?.[0]);
  const ask = toNum(ticker?.a?.[0]);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Kraken Spot Ticker" };
}

async function fetchTickerCoinbase(symbol: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.exchange.coinbase.com/products/${symbol}/ticker`);
  const bid = toNum(data?.bid);
  const ask = toNum(data?.ask);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

  if (bid <= 0 || ask <= 0 || mid <= 0) {
    return null;
  }

  return { bid, ask, mid, source: "Coinbase Spot Ticker" };
}

async function fetchTickerCoinGecko(coingeckoId: string): Promise<TickerResult | null> {
  const data = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false`);
  const tokenData = data?.[coingeckoId];
  const price = toNum(tokenData?.usd);

  if (price <= 0) {
    return null;
  }

  // CoinGecko não fornece bid/ask, usamos o preço como mid
  const bid = price * 0.9999;
  const ask = price * 1.0001;

  return { bid, ask, mid: price, source: "CoinGecko" };
}

async function fetchTickerCoinMarketCap(slug: string): Promise<TickerResult | null> {
  try {
    const data = await fetchJson(`https://api.coinmarketcap.com/data-api/v3/cryptocurrency/detail?slug=${slug}`);
    const tokenData = data?.data?.statistics?.price;
    const price = toNum(tokenData);

    if (price <= 0) {
      return null;
    }

    const bid = price * 0.9999;
    const ask = price * 1.0001;

    return { bid, ask, mid: price, source: "CoinMarketCap" };
  } catch {
    return null;
  }
}

async function fetchTickerDefiLlama(coingeckoId: string, defilamaSymbol?: string): Promise<TickerResult | null> {
  try {
    // Tenta primeiro com o símbolo customizado se fornecido (ex: ethereum:0x...)
    if (defilamaSymbol) {
      const data = await fetchJson(
        `https://coins.llama.fi/prices/current/${defilamaSymbol}`
      );
      
      const coins = data?.coins || {};
      const tokenData = coins[defilamaSymbol];
      
      if (tokenData) {
        const price = toNum(tokenData.price);
        if (price > 0) {
          const bid = price * 0.9999;
          const ask = price * 1.0001;
          return { bid, ask, mid: price, source: "DefiLlama" };
        }
      }
    }

    // Tenta com o CoinGecko ID
    const data = await fetchJson(
      `https://coins.llama.fi/prices/current/coingecko:${coingeckoId}`
    );
    
    const coins = data?.coins || {};
    const key = `coingecko:${coingeckoId}`;
    const tokenData = coins[key];
    
    if (!tokenData) {
      return null;
    }
    
    const price = toNum(tokenData.price);
    
    if (price <= 0) {
      return null;
    }

    // DefiLlama nao fornece bid/ask, usamos o preco como mid
    const bid = price * 0.9999;
    const ask = price * 1.0001;

    return { bid, ask, mid: price, source: "DefiLlama" };
  } catch {
    return null;
  }
}

async function fetchAggregatorRatio(pair: PairConfig): Promise<TickerResult | null> {
  const baseMeta = ASSET_METADATA[pair.baseAsset];
  const quoteMeta = ASSET_METADATA[pair.quoteAsset as AssetSymbol];

  if (!baseMeta || !quoteMeta) {
    return null;
  }

  try {
    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerCoinGecko(baseMeta.coingeckoId),
      fetchTickerCoinGecko(quoteMeta.coingeckoId),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "CoinGecko ratio",
      };
    }
  } catch {
    // Continua para o fallback seguinte.
  }

  try {
    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerCoinMarketCap(baseMeta.coinmarketcapSlug),
      fetchTickerCoinMarketCap(quoteMeta.coinmarketcapSlug),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "CoinMarketCap ratio",
      };
    }
  } catch {
    // Continua para o fallback seguinte.
  }

  try {
    const defilamaAddrs = pair.defilamaSymbol?.split(",").map(s => s.trim()) || [];
    const baseDefillama = defilamaAddrs[0] || undefined;
    const quoteDefillama = defilamaAddrs[1] || undefined;

    const [baseTicker, quoteTicker] = await Promise.all([
      fetchTickerDefiLlama(baseMeta.coingeckoId, baseDefillama),
      fetchTickerDefiLlama(quoteMeta.coingeckoId, quoteDefillama),
    ]);

    if (baseTicker && quoteTicker && baseTicker.mid > 0 && quoteTicker.mid > 0) {
      const mid = baseTicker.mid / quoteTicker.mid;
      return {
        bid: mid * 0.9999,
        ask: mid * 1.0001,
        mid,
        source: "DefiLlama ratio",
      };
    }
  } catch {
    // Sem razao disponivel nos agregadores.
  }

  return null;
}

async function fetchTickerWithFallback(pair: PairConfig): Promise<{ ticker: TickerResult | null; reason: string | null }> {
  const errors: string[] = [];

  try {
    const ticker = await fetchTickerBinance(pair.symbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Binance");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerGate(pair.gateSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Gate");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerKucoin(pair.kucoinSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na KuCoin");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerOkx(pair.okxInstId);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na OKX");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinex(pair.coinexMarket);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na CoinEx");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerBybit(pair.bybitSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Bybit");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerHtx(pair.htxSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na HTX");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerKraken(pair.krakenSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Kraken");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinbase(pair.coinbaseSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem bid/ask valido na Coinbase");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  if (pair.disableAggregatorFallback) {
    const reason = [...new Set(errors)].join(" | ");
    return { ticker: null, reason: reason || null };
  }

  if (pair.idealType === "cross_peg") {
    try {
      const ticker = await fetchAggregatorRatio(pair);
      if (ticker) {
        return {
          ticker,
          reason: [...new Set(errors)].join(" | ") || null,
        };
      }
      errors.push("Sem razao disponivel nos agregadores para o par monitorado");
    } catch (err) {
      errors.push(normalizeError(err));
    }

    const reason = [...new Set(errors)].join(" | ");
    return {
      ticker: null,
      reason:
        reason ||
        "Sem fonte executavel de orderbook e sem preco indicativo de ratio no momento",
    };
  }

  try {
    const ticker = await fetchTickerCoinGecko(pair.coingeckoId);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinGecko");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinMarketCap(pair.coinmarketcapSlug);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinMarketCap");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const defilamaAddrs = pair.defilamaSymbol?.split(",").map(s => s.trim()) || [];
    const baseDefillama = defilamaAddrs[0] || undefined;
    const ticker = await fetchTickerDefiLlama(pair.coingeckoId, baseDefillama);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na DefiLlama");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  const reason = [...new Set(errors)].join(" | ");
  return { ticker: null, reason: reason || null };
}

async function fetchStableAssetPrice(asset: MonitoredAsset): Promise<{ ticker: TickerResult | null; reason: string | null }> {
  const errors: string[] = [];

  try {
    const ticker = await fetchTickerCoinGecko(asset.coingeckoId);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinGecko");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerCoinMarketCap(asset.coinmarketcapSlug);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na CoinMarketCap");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  try {
    const ticker = await fetchTickerDefiLlama(asset.coingeckoId, asset.defilamaSymbol);
    if (ticker) return { ticker, reason: null };
    errors.push("Sem preco disponivel na DefiLlama");
  } catch (err) {
    errors.push(normalizeError(err));
  }

  const reason = [...new Set(errors)].join(" | ");
  return { ticker: null, reason: reason || null };
}

async function fetchFxToUsd(base: FxBase): Promise<number> {
  const payload = await fetchJson(`https://api.frankfurter.app/latest?from=${base}&to=USD`);
  const rate = toNum(payload?.rates?.USD);
  if (rate <= 0) {
    throw new Error(`FX ${base}/USD indisponivel`);
  }
  return rate;
}

async function fetchBinanceUsdtBrl(): Promise<number> {
  // Tenta obter USDT/BRL diretamente da Binance (mais atualizado que taxa de câmbio)
  const hosts = ["api.binance.com", "api1.binance.com", "api2.binance.com", "api3.binance.com"];
  
  for (const host of hosts) {
    try {
      const payload = await fetchJson(`https://${host}/api/v3/ticker/24hr?symbol=USDTBRL`);
      const price = toNum(payload?.lastPrice);
      if (price > 0) {
        return price;
      }
    } catch {
      // Tenta proximo host
    }
  }
  
  // Fallback para CryptoCompare se Binance direto nao funcionar
  try {
    const fallback = await fetchJson("https://min-api.cryptocompare.com/data/price?fsym=USDT&tsyms=BRL&e=Binance");
    const price = toNum(fallback?.BRL);
    if (price > 0) {
      return price;
    }
  } catch {
    // Continua para Frankfurter
  }
  
  throw new Error("Binance USDT/BRL indisponivel");
}

async function fetchUsdToBrl(): Promise<number> {
  // Tenta Binance primeiro (mais atualizado)
  try {
    return await fetchBinanceUsdtBrl();
  } catch {
    // Fallback para Frankfurter
  }
  
  const payload = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=BRL");
  const rate = toNum(payload?.rates?.BRL);
  if (rate <= 0) {
    throw new Error("FX USD/BRL indisponivel");
  }
  return rate;
}

function classify(asymmetryPct: number): { severity: DepegRow["severity"]; signal: DepegRow["signal"] } {
  if (asymmetryPct >= 4) return { severity: "high", signal: "stress" };
  if (asymmetryPct >= 1.5) return { severity: "medium", signal: "opportunity" };
  return { severity: "low", signal: "watch" };
}

function isBrlStableQuote(quoteAsset: QuoteAsset): boolean {
  return quoteAsset === "BRL" || quoteAsset === "BRLA" || quoteAsset === "BRL1" || quoteAsset === "BRZ";
}

type PegCurrency = MonitoredAsset["pegCurrency"];
type PricingContext = {
  usdBrl: number;
  eurUsd: number;
  xauUsd: number;
};

function toBrlDisplay(value: number, pegCurrency: PegCurrency, ctx: PricingContext): number | null {
  if (value <= 0) return null;
  if (pegCurrency === "BRL") return Number(value.toFixed(6));
  if (ctx.usdBrl <= 0) return null;

  if (pegCurrency === "USD") {
    return Number((value * ctx.usdBrl).toFixed(6));
  }

  if (pegCurrency === "EUR") {
    if (ctx.eurUsd <= 0) return null;
    return Number((value * ctx.eurUsd * ctx.usdBrl).toFixed(6));
  }

  if (pegCurrency === "XAU") {
    if (ctx.xauUsd <= 0) return null;
    return Number((value * ctx.xauUsd * ctx.usdBrl).toFixed(6));
  }

  return null;
}

function toPegPriceFromUsd(priceUsd: number, pegCurrency: PegCurrency, ctx: PricingContext): number {
  if (priceUsd <= 0) return 0;

  if (pegCurrency === "USD") {
    return priceUsd;
  }

  if (pegCurrency === "BRL") {
    if (ctx.usdBrl <= 0) return 0;
    return priceUsd * ctx.usdBrl;
  }

  if (pegCurrency === "EUR") {
    if (ctx.eurUsd <= 0) return 0;
    return priceUsd / ctx.eurUsd;
  }

  if (ctx.xauUsd <= 0) return 0;
  return priceUsd / ctx.xauUsd;
}

function estimatedFeePct(quoteAsset: DepegRow["quote_asset"]): number {
  return isBrlStableQuote(quoteAsset) ? 0.1 : 0.15;
}

function netMarginPct(row: Pick<DepegRow, "depeg_pct" | "orderbook_spread_pct" | "quote_asset">): number | null {
  if (row.depeg_pct === null || row.orderbook_spread_pct === null) return null;
  return Math.abs(row.depeg_pct) - row.orderbook_spread_pct - estimatedFeePct(row.quote_asset);
}

function hasExecutableOrderbookSource(source: string): boolean {
  return (
    source.includes("Binance Spot BookTicker") ||
    source.includes("Gate Spot Ticker") ||
    source.includes("KuCoin Spot Level1") ||
    source.includes("OKX Spot Ticker") ||
    source.includes("CoinEx Spot Ticker") ||
    source.includes("Bybit Spot Ticker") ||
    source.includes("HTX Spot Ticker") ||
    source.includes("Kraken Spot Ticker") ||
    source.includes("Coinbase Spot Ticker")
  );
}

export async function GET(request: NextRequest) {
  const thresholdPct = parsePositive(request.nextUrl.searchParams.get("min_depeg_pct"), 0.35);
  const directionMode = parseDirectionMode(request.nextUrl.searchParams.get("direction_mode"));
  const now = Date.now();
  const cacheKey = `${thresholdPct.toFixed(4)}:${directionMode}`;
  const cacheHit = cache.get(cacheKey);

  if (cacheHit && cacheHit.expiresAt > now) {
    return NextResponse.json(cacheHit.payload, { status: 200 });
  }

  try {
    let usdBrl = 0;
    let eurUsd = 0;
    let xauUsd = 0;

    const needsUsdBrl = MONITORED_ASSETS.some((asset) => asset.pegCurrency !== "BRL");
    if (needsUsdBrl) {
      try {
        usdBrl = await fetchUsdToBrl();
      } catch {
        usdBrl = 0;
      }
    }

    const needsEurUsd = MONITORED_ASSETS.some((asset) => asset.pegCurrency === "EUR");
    if (needsEurUsd) {
      try {
        eurUsd = await fetchFxToUsd("EUR");
      } catch {
        eurUsd = 0;
      }
    }

    const needsXauUsd = MONITORED_ASSETS.some((asset) => asset.pegCurrency === "XAU");
    if (needsXauUsd) {
      try {
        const xauTicker = await fetchTickerCoinGecko("pax-gold");
        xauUsd = xauTicker?.mid && xauTicker.mid > 0 ? xauTicker.mid : 0;
      } catch {
        xauUsd = 0;
      }
    }

    const pricingContext: PricingContext = { usdBrl, eurUsd, xauUsd };

    const rawRows = await Promise.all(
      MONITORED_ASSETS.map(async (asset) => {
        const pegReference = asset.pegReference;
        const idealPrice = 1;

        try {
          const { ticker, reason } = await fetchStableAssetPrice(asset);
          if (!ticker) {
            return {
              id: asset.id,
              label: asset.label,
              symbol: `${asset.symbol}/${asset.pegCurrency}`,
              quote_asset: asset.pegCurrency,
              status: "unavailable",
              analyzed_on: "CoinGecko/CoinMarketCap/DefiLlama",
              peg_reference: pegReference,
              market_price: null,
              market_price_brl: null,
              bid_price: null,
              ask_price: null,
              orderbook_spread_pct: null,
              ideal_price: Number(idealPrice.toFixed(6)),
              ideal_price_brl: toBrlDisplay(idealPrice, asset.pegCurrency, pricingContext),
              depeg_pct: null,
              asymmetry_pct: null,
              direction: "below_peg",
              severity: "low",
              signal: "watch",
              notes: reason
                ? `Ativo monitorado, mas sem cotacao disponivel neste ciclo (${reason}).`
                : "Ativo monitorado, mas sem cotacao disponivel neste ciclo.",
            } as DepegRow;
          }

          const marketPriceInPeg = toPegPriceFromUsd(ticker.mid, asset.pegCurrency, pricingContext);
          if (marketPriceInPeg <= 0) {
            return {
              id: asset.id,
              label: asset.label,
              symbol: `${asset.symbol}/${asset.pegCurrency}`,
              quote_asset: asset.pegCurrency,
              status: "unavailable",
              analyzed_on: ticker.source,
              peg_reference: pegReference,
              market_price: null,
              market_price_brl: null,
              bid_price: null,
              ask_price: null,
              orderbook_spread_pct: null,
              ideal_price: Number(idealPrice.toFixed(6)),
              ideal_price_brl: toBrlDisplay(idealPrice, asset.pegCurrency, pricingContext),
              depeg_pct: null,
              asymmetry_pct: null,
              direction: "below_peg",
              severity: "low",
              signal: "watch",
              notes: "Ativo monitorado, mas sem referencia valida para calcular de-peg neste ciclo.",
            } as DepegRow;
          }

          const depegPct = ((marketPriceInPeg - idealPrice) / idealPrice) * 100;
          const asymmetryPct = Math.abs(depegPct);
          const direction: DepegRow["direction"] = depegPct >= 0 ? "above_peg" : "below_peg";
          const { severity, signal } = classify(asymmetryPct);

          const notes = direction === "below_peg"
            ? "Ativo abaixo do peg teorico no momento."
            : "Ativo acima do peg teorico no momento.";

          return {
            id: asset.id,
            label: asset.label,
            symbol: `${asset.symbol}/${asset.pegCurrency}`,
            quote_asset: asset.pegCurrency,
            status: "ok",
            analyzed_on: ticker.source,
            peg_reference: pegReference,
            market_price: Number(marketPriceInPeg.toFixed(6)),
            market_price_brl: toBrlDisplay(marketPriceInPeg, asset.pegCurrency, pricingContext),
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: Number(idealPrice.toFixed(6)),
            ideal_price_brl: toBrlDisplay(idealPrice, asset.pegCurrency, pricingContext),
            depeg_pct: Number(depegPct.toFixed(4)),
            asymmetry_pct: Number(asymmetryPct.toFixed(4)),
            direction,
            severity,
            signal,
            notes,
          } as DepegRow;
        } catch (err) {
          const reason = normalizeError(err);
          return {
            id: asset.id,
            label: asset.label,
            symbol: `${asset.symbol}/${asset.pegCurrency}`,
            quote_asset: asset.pegCurrency,
            status: "unavailable",
            analyzed_on: "CoinGecko/CoinMarketCap/DefiLlama",
            peg_reference: pegReference,
            market_price: null,
            market_price_brl: null,
            bid_price: null,
            ask_price: null,
            orderbook_spread_pct: null,
            ideal_price: Number(idealPrice.toFixed(6)),
            ideal_price_brl: toBrlDisplay(idealPrice, asset.pegCurrency, pricingContext),
            depeg_pct: null,
            asymmetry_pct: null,
            direction: "below_peg",
            severity: "low",
            signal: "watch",
            notes: `Ativo monitorado, mas a consulta da cotacao falhou neste ciclo (${reason})`,
          } as DepegRow;
        }
      })
    );

    const opportunities = rawRows
      .filter((row): row is DepegRow => row !== null)
      .sort((a, b) => {
        const aVal = a.asymmetry_pct ?? Number.NEGATIVE_INFINITY;
        const bVal = b.asymmetry_pct ?? Number.NEGATIVE_INFINITY;
        return bVal - aVal;
      });

    const contractRows = await buildContractRows(pricingContext);

    const contractOpportunities = contractRows
      .filter(
        (row): row is DepegContractRow & { status: "ok"; asymmetry_pct: number } =>
          row.status === "ok" &&
          row.asymmetry_pct !== null &&
          row.asymmetry_pct >= thresholdPct &&
          row.depeg_pct !== null &&
          (
            directionMode === "all" ||
            (directionMode === "buy_discount" && row.depeg_pct < 0) ||
            (directionMode === "sell_premium" && row.depeg_pct > 0)
          )
      )
      .sort((a, b) => {
        const aNet = netMarginPct(a);
        const bNet = netMarginPct(b);
        if (aNet === null && bNet === null) return b.asymmetry_pct - a.asymmetry_pct;
        if (aNet === null) return 1;
        if (bNet === null) return -1;
        if (bNet !== aNet) return bNet - aNet;
        return b.asymmetry_pct - a.asymmetry_pct;
      });

    const aboveThreshold = opportunities
      .filter(
        (row): row is DepegRow & { status: "ok"; asymmetry_pct: number } =>
          row.status === "ok" &&
          row.asymmetry_pct !== null &&
          row.asymmetry_pct >= thresholdPct &&
          row.depeg_pct !== null &&
          (
            directionMode === "all" ||
            (directionMode === "buy_discount" && row.depeg_pct < 0) ||
            (directionMode === "sell_premium" && row.depeg_pct > 0)
          )
      )
      .sort((a, b) => {
        const aNet = netMarginPct(a);
        const bNet = netMarginPct(b);
        if (aNet === null && bNet === null) return b.asymmetry_pct - a.asymmetry_pct;
        if (aNet === null) return 1;
        if (bNet === null) return -1;
        if (bNet !== aNet) return bNet - aNet;
        return b.asymmetry_pct - a.asymmetry_pct;
      });

    const best = contractOpportunities[0] ?? aboveThreshold[0] ?? null;
    const bestNetMargin = best ? netMarginPct(best) : null;
    const maxAsymmetryPct = (contractRows.length > 0 ? contractRows : opportunities).reduce((max, row) => {
      if (row.status !== "ok" || row.asymmetry_pct === null) return max;
      return Math.max(max, row.asymmetry_pct);
    }, 0);

    const warningByDirection: Record<DirectionMode, string> = {
      all: "Sem de-peg acima do limiar na direcao selecionada (todas) no momento. Exibindo os valores atuais de todos os ativos monitorados.",
      buy_discount: "Sem de-peg abaixo da paridade acima do limiar no momento. Exibindo os valores atuais de todos os ativos monitorados.",
      sell_premium: "Sem de-peg acima da paridade acima do limiar no momento. Exibindo os valores atuais de todos os ativos monitorados.",
    };

    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "coingecko/coinmarketcap/defillama + usd-brl",
      threshold_pct: Number(thresholdPct.toFixed(4)),
      usd_brl: usdBrl > 0 ? Number(usdBrl.toFixed(6)) : null,
      monitored_rows: opportunities,
      contract_rows: contractRows,
      opportunities: contractOpportunities,
      summary: {
        monitored_pairs: contractRows.length > 0 ? contractRows.length : MONITORED_ASSETS.length,
        above_threshold: contractRows.length > 0 ? contractOpportunities.length : aboveThreshold.length,
        max_asymmetry_pct: Number(maxAsymmetryPct.toFixed(4)),
        best_opportunity: best
          ? {
              id: best.id,
              label: best.label,
              depeg_pct: best.depeg_pct,
              asymmetry_pct: best.asymmetry_pct,
              direction: best.direction,
              signal: best.signal,
              net_margin_pct: bestNetMargin !== null ? Number(bestNetMargin.toFixed(4)) : null,
            }
          : null,
      },
      warning:
        aboveThreshold.length === 0
          ? warningByDirection[directionMode]
          : "Sinal baseado no preco do ativo contra seu peg teorico. Valide liquidez e custo operacional antes de executar qualquer operacao.",
    };

    cache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    const payload: DepegResponse = {
      timestamp: new Date().toISOString(),
      source: "coingecko/coinmarketcap/defillama + usd-brl",
      threshold_pct: Number(thresholdPct.toFixed(4)),
      usd_brl: null,
      monitored_rows: fallbackRows("Ativo monitorado, mas a atualizacao geral da API falhou neste ciclo."),
      contract_rows: [],
      opportunities: [],
      summary: {
        monitored_pairs: MONITORED_ASSETS.length,
        above_threshold: 0,
        max_asymmetry_pct: 0,
        best_opportunity: null,
      },
      error: normalizeError(err),
      warning: "Nao foi possivel atualizar os dados de de-peg agora. Tente novamente em instantes.",
    };

    return NextResponse.json(payload, { status: 200 });
  }
}
