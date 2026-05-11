"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TokenExchangeQuote = {
	exchange: string;
	label: string;
	status: "ok" | "not_listed";
	price_brl?: number;
	bid_price_brl?: number;
	ask_price_brl?: number;
	volume_24h_brl?: number;
};

type FanTokenRow = {
	id: string;
	symbol: string;
	team: string;
	status: "ok" | "error";
	exchanges?: TokenExchangeQuote[];
};

type FanTokensResponse = {
	timestamp: string;
	tokens: FanTokenRow[];
	error?: string;
};

const REFRESH_SECONDS = 20;
const ORDER = [
	"binance",
	"bybit",
	"bingx",
	"kraken",
	"coinbase",
	"bitget",
	"okx",
	"kucoin",
	"novadax",
	"mercadobitcoin",
];

const EXCHANGE_NETWORKS: Record<string, string[]> = {
	binance: ["TRC20", "BEP20", "ERC20", "Solana"],
	bybit: ["TRC20", "ERC20", "Arbitrum", "BSC", "Solana"],
	bingx: ["TRC20", "ERC20", "BEP20", "Polygon"],
	kraken: ["ERC20", "TRC20", "Polygon", "Arbitrum"],
	coinbase: ["ERC20", "Base", "Solana"],
	bitget: ["TRC20", "ERC20", "BEP20", "Arbitrum"],
	okx: ["TRC20", "ERC20", "BEP20", "Polygon", "Solana"],
	kucoin: ["TRC20", "ERC20", "BEP20", "KCC"],
	novadax: ["TRC20", "ERC20", "BEP20"],
	mercadobitcoin: ["TRC20", "ERC20"],
};

const NETWORK_TRANSFER_FEE_ASSET: Record<string, number> = {
	TRC20: 1,
	BEP20: 0.3,
	BSC: 0.3,
	ERC20: 4.5,
	Arbitrum: 0.2,
	Polygon: 0.2,
	Solana: 0.1,
	Base: 0.1,
	KCC: 0.1,
};

const NETWORK_TRANSFER_ETA_MINUTES: Record<string, { min: number; max: number }> = {
	TRC20: { min: 2, max: 8 },
	BEP20: { min: 1, max: 5 },
	BSC: { min: 1, max: 5 },
	ERC20: { min: 8, max: 25 },
	Arbitrum: { min: 1, max: 4 },
	Polygon: { min: 1, max: 6 },
	Solana: { min: 1, max: 3 },
	Base: { min: 1, max: 5 },
	KCC: { min: 2, max: 8 },
};

const DEFAULT_TRANSFER_FEE_ASSET = 1;
const ALL_TOKENS_ID = "__ALL__";

const DEFAULT_FEES: Record<string, { buy: number; sell: number }> = {
	binance: { buy: 0.2, sell: 0.2 },
	bybit: { buy: 0.2, sell: 0.2 },
	bingx: { buy: 0.2, sell: 0.2 },
	kraken: { buy: 0.4, sell: 0.4 },
	coinbase: { buy: 0.6, sell: 0.6 },
	bitget: { buy: 0.2, sell: 0.2 },
	okx: { buy: 0.2, sell: 0.2 },
	kucoin: { buy: 0.2, sell: 0.2 },
	novadax: { buy: 0.35, sell: 0.35 },
	mercadobitcoin: { buy: 0.45, sell: 0.45 },
};

function money(v: number) {
	return `R$ ${v.toFixed(4)}`;
}

function vol(v: number) {
	if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(2)}B`;
	if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
	if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
	return `R$ ${v.toFixed(0)}`;
}

type ScreenerRow = {
	key: string;
	tokenId: string;
	tokenSymbol: string;
	tokenTeam: string;
	buyExchangeKey: string;
	sellExchangeKey: string;
	buyLabel: string;
	sellLabel: string;
	buyPrice: number;
	sellPrice: number;
	grossSpreadPct: number;
	netProfitBrl: number;
	netProfitPct: number;
	assetAfterTransfer: number;
	liquidityBrl: number;
	buyFeePct: number;
	sellFeePct: number;
	transferFeeAsset: number;
	transferNetwork: string | null;
	hasNetworkMatch: boolean;
	commonNetworks: string[];
	score: number;
};

export default function ArbitragemScannerPage() {
	const [data, setData] = useState<FanTokensResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
	const [countdown, setCountdown] = useState(REFRESH_SECONDS);
	const [selectedTokenId, setSelectedTokenId] = useState(ALL_TOKENS_ID);
	const [amountBrl, setAmountBrl] = useState("1000");
	const [customFees, setCustomFees] = useState<Record<string, { buy: number; sell: number }>>(DEFAULT_FEES);
	const [showFees, setShowFees] = useState(false);
	const [minSpreadPct, setMinSpreadPct] = useState("0.00");
	const [minNetProfitBrl, setMinNetProfitBrl] = useState("0");
	const [transferBufferBrl, setTransferBufferBrl] = useState("0");
	const [onlyNetworkMatch, setOnlyNetworkMatch] = useState(false);
	const [onlyPositive, setOnlyPositive] = useState(false);
	const [maxRows, setMaxRows] = useState("20");
	const [enabledExchanges, setEnabledExchanges] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(ORDER.map((key) => [key, true])) as Record<string, boolean>
	);
	const [selectedSignalKey, setSelectedSignalKey] = useState<string | null>(null);
	const [simAmountBrl, setSimAmountBrl] = useState("1000");
	const [simTransferExtraBrl, setSimTransferExtraBrl] = useState("0");
	const [simBuySlippagePct, setSimBuySlippagePct] = useState("0.10");
	const [simSellSlippagePct, setSimSellSlippagePct] = useState("0.10");

	async function load() {
		try {
			const res = await fetch("/api/fan-tokens", { cache: "no-store" });
			if (!res.ok) return;
			const json = (await res.json()) as FanTokensResponse;
			setData(json);
		} catch {
			// Mantem os dados atuais em falha temporaria de API.
		} finally {
			setLoading(false);
			setCountdown(REFRESH_SECONDS);
		}
	}

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		if (!autoRefreshEnabled) return;

		const t1 = setInterval(load, REFRESH_SECONDS * 1000);
		const t2 = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);

		return () => {
			clearInterval(t1);
			clearInterval(t2);
		};
	}, [autoRefreshEnabled]);

	const tokenOptions = useMemo(() => {
		if (!data?.tokens) return [] as FanTokenRow[];
		return data.tokens
			.filter((token) => token.status === "ok" && token.symbol !== "USDT")
			.filter((token) => (token.exchanges ?? []).some((quote) => quote.status === "ok" && (quote.ask_price_brl ?? 0) > 0 && (quote.bid_price_brl ?? 0) > 0))
			.sort((a, b) => a.symbol.localeCompare(b.symbol));
	}, [data]);

	useEffect(() => {
		if (selectedTokenId === ALL_TOKENS_ID) return;
		if (!tokenOptions.some((token) => token.id === selectedTokenId)) {
			setSelectedTokenId(ALL_TOKENS_ID);
		}
	}, [tokenOptions, selectedTokenId]);

	const selectedToken = useMemo(
		() => (selectedTokenId === ALL_TOKENS_ID ? null : tokenOptions.find((token) => token.id === selectedTokenId) ?? null),
		[tokenOptions, selectedTokenId]
	);

	const activeTokens = useMemo(() => {
		if (selectedToken) return [selectedToken];
		return tokenOptions;
	}, [selectedToken, tokenOptions]);

	const selectedTokenCards = useMemo(() => {
		if (!selectedToken) return [];
		return (selectedToken.exchanges ?? [])
			.filter((ex) => ORDER.includes(ex.exchange) && ex.status === "ok" && (ex.ask_price_brl ?? 0) > 0 && (ex.bid_price_brl ?? 0) > 0)
			.map((ex) => ({ key: ex.exchange, ex }));
	}, [selectedToken]);

	const exchangeLabelByKey = useMemo(() => {
		const labels = new Map<string, string>();
		for (const token of tokenOptions) {
			for (const exchange of token.exchanges ?? []) {
				if (!labels.has(exchange.exchange)) {
					labels.set(exchange.exchange, exchange.label);
				}
			}
		}
		return labels;
	}, [tokenOptions]);

	const allRows = useMemo(() => {
		const amount = parseFloat(amountBrl);
		if (!Number.isFinite(amount) || amount <= 0) return [] as ScreenerRow[];

		const minSpread = parseFloat(minSpreadPct) || 0;
		const minNetProfit = parseFloat(minNetProfitBrl) || 0;
		const transferBuffer = parseFloat(transferBufferBrl) || 0;
		const list: ScreenerRow[] = [];

		for (const token of activeTokens) {
			const selected = (token.exchanges ?? [])
				.filter((ex) => ORDER.includes(ex.exchange) && ex.status === "ok" && (ex.ask_price_brl ?? 0) > 0 && (ex.bid_price_brl ?? 0) > 0)
				.map((ex) => ({ key: ex.exchange, ex }))
				.filter(({ key }) => enabledExchanges[key] ?? true);

			for (const buy of selected) {
				for (const sell of selected) {
					if (buy.key === sell.key) continue;

				const buyPrice = buy.ex.ask_price_brl ?? 0;
				const sellPrice = sell.ex.bid_price_brl ?? 0;
				if (buyPrice <= 0 || sellPrice <= 0) continue;

				const buyFeePct = customFees[buy.key]?.buy ?? 0.1;
				const sellFeePct = customFees[sell.key]?.sell ?? 0.1;
				const buyFee = buyFeePct / 100;
				const sellFee = sellFeePct / 100;

				const grossSpreadPct = ((sellPrice - buyPrice) / buyPrice) * 100;

				const buyNetworks = EXCHANGE_NETWORKS[buy.key] ?? [];
				const sellNetworks = EXCHANGE_NETWORKS[sell.key] ?? [];
				const commonNetworks = buyNetworks.filter((network) => sellNetworks.includes(network));
				const hasNetworkMatch = commonNetworks.length > 0;

				if (onlyNetworkMatch && !hasNetworkMatch) continue;

				const transferNetwork = commonNetworks[0] ?? null;

				const transferFeeAsset = transferNetwork
					? NETWORK_TRANSFER_FEE_ASSET[transferNetwork] ?? DEFAULT_TRANSFER_FEE_ASSET
					: 0;

				const assetBought = (amount / buyPrice) * (1 - buyFee);
				const assetAfterTransfer = Math.max(assetBought - transferFeeAsset, 0);
				const brlBack = assetAfterTransfer * sellPrice * (1 - sellFee);
				const netProfitBrl = brlBack - amount - transferBuffer;
				const netProfitPct = (netProfitBrl / amount) * 100;

				if (grossSpreadPct < minSpread) continue;
				if (netProfitBrl < minNetProfit) continue;
				if (onlyPositive && netProfitBrl <= 0) continue;

				const liquidityBrl = Math.min(buy.ex.volume_24h_brl ?? 0, sell.ex.volume_24h_brl ?? 0);
				const liquidityFactor = Math.min(liquidityBrl / 1_000_000, 10);
				const score = netProfitPct * 10 + liquidityFactor + (hasNetworkMatch ? 5 : -20);

					list.push({
					key: `${token.id}__${buy.key}__${sell.key}__${transferNetwork ?? "none"}`,
					tokenId: token.id,
					tokenSymbol: token.symbol,
					tokenTeam: token.team,
					buyExchangeKey: buy.key,
					sellExchangeKey: sell.key,
					buyLabel: buy.ex.label,
					sellLabel: sell.ex.label,
					buyPrice,
					sellPrice,
					grossSpreadPct,
					netProfitBrl,
					netProfitPct,
					assetAfterTransfer,
					liquidityBrl,
					buyFeePct,
					sellFeePct,
					transferFeeAsset,
					transferNetwork,
					hasNetworkMatch,
					commonNetworks,
					score,
					});
				}
			}
		}

		return list
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if (b.netProfitBrl !== a.netProfitBrl) return b.netProfitBrl - a.netProfitBrl;
				return b.liquidityBrl - a.liquidityBrl;
			});
	}, [
		amountBrl,
		minSpreadPct,
		minNetProfitBrl,
		transferBufferBrl,
		onlyNetworkMatch,
		onlyPositive,
		activeTokens,
		enabledExchanges,
		customFees,
	]);

	const rows = useMemo(() => {
		const max = Math.max(1, Math.min(100, parseInt(maxRows || "20", 10) || 20));
		return allRows.slice(0, max);
	}, [allRows, maxRows]);

	const viabilityCards = useMemo(() => {
		const bestByToken = new Map<string, ScreenerRow>();
		for (const row of allRows) {
			const current = bestByToken.get(row.tokenId);
			if (!current || row.score > current.score) {
				bestByToken.set(row.tokenId, row);
			}
		}

		return tokenOptions
			.map((token) => {
				const best = bestByToken.get(token.id) ?? null;
				return {
					token,
					best,
					viable: (best?.netProfitBrl ?? Number.NEGATIVE_INFINITY) > 0,
				};
			})
			.sort((a, b) => {
				if (a.viable !== b.viable) return a.viable ? -1 : 1;
				return (b.best?.score ?? Number.NEGATIVE_INFINITY) - (a.best?.score ?? Number.NEGATIVE_INFINITY);
			});
	}, [tokenOptions, allRows]);

	const summary = useMemo(() => {
		const total = rows.length;
		const profitable = rows.filter((row) => row.netProfitBrl > 0).length;
		const withNetworkMatch = rows.filter((row) => row.hasNetworkMatch).length;
		const best = rows[0] ?? null;
		return { total, profitable, withNetworkMatch, best };
	}, [rows]);

	const signalDeck = useMemo(() => rows.slice(0, 3), [rows]);

	const viabilityRadar = useMemo(() => {
		const maxAbsProfit = Math.max(
			1,
			...viabilityCards
				.map(({ best }) => Math.abs(best?.netProfitBrl ?? 0))
				.filter((value) => Number.isFinite(value))
		);

		return viabilityCards.slice(0, 10).map(({ token, best, viable }) => {
			const net = best?.netProfitBrl ?? 0;
			const strength = Math.max(6, Math.min(100, (Math.abs(net) / maxAbsProfit) * 100));
			return {
				token,
				best,
				viable,
				net,
				strength,
			};
		});
	}, [viabilityCards]);

	const pulse = useMemo(() => {
		if (summary.total === 0) return { label: "Mercado frio", color: "var(--muted)" };
		const ratio = summary.profitable / summary.total;
		if (ratio >= 0.55) return { label: "Mercado quente", color: "var(--ok)" };
		if (ratio >= 0.25) return { label: "Mercado misto", color: "#f59e0b" };
		return { label: "Mercado defensivo", color: "var(--error)" };
	}, [summary]);

	useEffect(() => {
		if (!selectedSignalKey || !signalDeck.some((row) => row.key === selectedSignalKey)) {
			setSelectedSignalKey(signalDeck[0]?.key ?? null);
		}
	}, [signalDeck, selectedSignalKey]);

	useEffect(() => {
		setSimAmountBrl(amountBrl);
		setSimTransferExtraBrl(transferBufferBrl);
	}, [amountBrl, transferBufferBrl]);

	const selectedSignal = useMemo(
		() => signalDeck.find((row) => row.key === selectedSignalKey) ?? signalDeck[0] ?? null,
		[signalDeck, selectedSignalKey]
	);

	const simulation = useMemo(() => {
		if (!selectedSignal) return null;

		const simAmount = parseFloat(simAmountBrl);
		if (!Number.isFinite(simAmount) || simAmount <= 0) return null;

		const extra = parseFloat(simTransferExtraBrl) || 0;
		const buySlip = (parseFloat(simBuySlippagePct) || 0) / 100;
		const sellSlip = (parseFloat(simSellSlippagePct) || 0) / 100;

		const buyFee = selectedSignal.buyFeePct / 100;
		const sellFee = selectedSignal.sellFeePct / 100;
		const adjustedBuy = selectedSignal.buyPrice * (1 + Math.max(buySlip, 0));
		const adjustedSell = selectedSignal.sellPrice * (1 - Math.max(sellSlip, 0));

		const assetBought = (simAmount / adjustedBuy) * (1 - buyFee);
		const assetAfterTransfer = Math.max(assetBought - selectedSignal.transferFeeAsset, 0);
		const brlBack = assetAfterTransfer * adjustedSell * (1 - sellFee);
		const net = brlBack - simAmount - extra;
		const netPct = (net / simAmount) * 100;

		const minSellForBreakEven =
			assetAfterTransfer > 0 && (1 - sellFee) > 0 ? (simAmount + extra) / (assetAfterTransfer * (1 - sellFee)) : 0;

		const riskScore =
			(simAmount > Math.max(selectedSignal.liquidityBrl * 0.02, 1) ? 35 : 0) +
			((selectedSignal.transferNetwork ? 0 : 25)) +
			(Math.max(0, buySlip + sellSlip - 0.003) * 6000) +
			(selectedSignal.netProfitBrl <= 0 ? 20 : 0);

		const riskLabel = riskScore >= 65 ? "Alto" : riskScore >= 35 ? "Moderado" : "Controlado";
		const viabilityLabel = net > 0 ? (netPct >= 1 ? "Executavel" : "Marginal") : "Inviavel";

		return {
			simAmount,
			extra,
			buySlip,
			sellSlip,
			adjustedBuy,
			adjustedSell,
			assetBought,
			assetAfterTransfer,
			brlBack,
			net,
			netPct,
			minSellForBreakEven,
			riskLabel,
			viabilityLabel,
		};
	}, [selectedSignal, simAmountBrl, simTransferExtraBrl, simBuySlippagePct, simSellSlippagePct]);

	return (
		<main className="page-shell" style={{ minHeight: "100vh", padding: "24px" }}>
			<div className="page-container" style={{ maxWidth: 1180, margin: "0 auto" }}>
				<header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
					<div>
						<div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 8, flexWrap: "wrap" }}>
							<Link href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>USDT/BRL</Link>
							<Link href="/fan-tokens" style={{ textDecoration: "none", color: "var(--muted)" }}>Arbitragem Geral</Link>
							<Link href="/spot-futures" style={{ textDecoration: "none", color: "var(--muted)" }}>Spot x Futuro</Link>
						</div>
						<h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.8px", fontWeight: 800 }}>Scanner de Arbitragem</h1>
						<p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
							Tela dedicada para ranking de rotas compra/venda entre corretoras para os tokens da Arbitragem Geral.
						</p>
					</div>
					<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<button
							onClick={() => {
								setLoading(true);
								load();
							}}
							disabled={loading}
							style={{
								border: "1px solid var(--card-border)",
								borderRadius: 12,
								padding: "10px 14px",
								background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))",
								color: "var(--text)",
								cursor: "pointer",
							}}
						>
							{loading ? "Atualizando..." : "Atualizar"}
						</button>
						<button
							onClick={() => setAutoRefreshEnabled((current) => !current)}
							style={{
								border: autoRefreshEnabled ? "1px solid rgba(255,107,107,0.65)" : "1px solid rgba(80,240,173,0.65)",
								borderRadius: 12,
								padding: "10px 14px",
								background: autoRefreshEnabled
									? "linear-gradient(135deg, rgba(78,18,18,0.85), rgba(28,12,12,0.85))"
									: "linear-gradient(135deg, rgba(12,59,43,0.9), rgba(9,37,29,0.9))",
								color: "#f4f7fb",
								cursor: "pointer",
								fontWeight: 700,
							}}
						>
							{autoRefreshEnabled ? "Stop" : "Start"}
						</button>
					</div>
				</header>

				<div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
					{selectedToken
						? `${selectedTokenCards.length} de ${(selectedToken.exchanges ?? []).filter((exchange) => ORDER.includes(exchange.exchange)).length} corretoras com livro para ${selectedToken.symbol}`
						: `${tokenOptions.length} moedas monitoradas (modo todas)`} · {autoRefreshEnabled ? `proxima atualizacao em ${countdown}s` : "auto-refresh pausado"}
				</div>

				<section
					style={{
						marginTop: 14,
						background: "linear-gradient(120deg, rgba(11,18,32,0.95), rgba(8,50,43,0.82))",
						border: "1px solid rgba(90,160,140,0.25)",
						borderRadius: 18,
						padding: 14,
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
						gap: 12,
					}}
				>
					<div style={{ minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
							<div style={{ fontSize: 11, color: "#9dd3c5", textTransform: "uppercase", letterSpacing: "0.08em" }}>Command Center</div>
							<div style={{ fontSize: 12, color: pulse.color, fontWeight: 700 }}>{pulse.label}</div>
						</div>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
							{signalDeck.length === 0 ? (
								<div style={{ color: "#9db0bd", fontSize: 13 }}>Sem sinais de alta prioridade com os filtros atuais.</div>
							) : (
								signalDeck.map((row, index) => (
									<button
										key={row.key}
										onClick={() => {
											setSelectedTokenId(row.tokenId);
											setSelectedSignalKey(row.key);
										}}
										style={{
											textAlign: "left",
											border: selectedSignalKey === row.key ? "1px solid rgba(80,240,173,0.95)" : "1px solid rgba(118,172,214,0.35)",
											borderRadius: 12,
											padding: 10,
											background: selectedSignalKey === row.key
												? "linear-gradient(135deg, rgba(13,59,57,0.9), rgba(10,35,46,0.78))"
												: "linear-gradient(135deg, rgba(17,43,64,0.72), rgba(12,30,44,0.66))",
											color: "#d8e6ef",
											cursor: "pointer",
										}}
									>
										<div style={{ fontSize: 10, color: "#8eb6c9", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sinal #{index + 1}</div>
										<div style={{ marginTop: 4, fontWeight: 700 }}>{row.tokenSymbol} · {row.buyLabel} → {row.sellLabel}</div>
										<div style={{ marginTop: 6, fontSize: 13, color: row.netProfitBrl >= 0 ? "#4be595" : "#ff8a8a", fontWeight: 700 }}>
											{row.netProfitBrl >= 0 ? "+" : ""}R$ {row.netProfitBrl.toFixed(2)}
										</div>
										<div style={{ marginTop: 2, fontSize: 12, color: "#9db0bd" }}>Score {row.score.toFixed(2)} · Spread {row.grossSpreadPct.toFixed(3)}%</div>
									</button>
								))
							)}
						</div>
					</div>

					<div style={{ border: "1px solid rgba(90,160,140,0.22)", borderRadius: 12, padding: 10, background: "rgba(6,19,30,0.38)" }}>
						<div style={{ fontSize: 11, color: "#9dd3c5", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
							Radar de Viabilidade
						</div>
						<div style={{ display: "grid", gap: 6 }}>
							{viabilityRadar.length === 0 ? (
								<div style={{ color: "#9db0bd", fontSize: 13 }}>Sem dados para radar.</div>
							) : (
								viabilityRadar.map((item) => (
									<div key={item.token.id} style={{ display: "grid", gridTemplateColumns: "54px 1fr 70px", alignItems: "center", gap: 8 }}>
										<button
											onClick={() => setSelectedTokenId(item.token.id)}
											style={{ border: "none", background: "transparent", color: "#d8e6ef", cursor: "pointer", textAlign: "left", padding: 0, fontSize: 12, fontWeight: 700 }}
										>
											{item.token.symbol}
										</button>
										<div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
											<div
												style={{
													height: "100%",
													width: `${item.strength}%`,
													background: item.viable ? "linear-gradient(90deg, #1fd18a, #50f0ad)" : "linear-gradient(90deg, #8b95a5, #b0b7c2)",
												}}
											/>
										</div>
										<div style={{ textAlign: "right", fontSize: 12, color: item.net >= 0 ? "#4be595" : "#ff8a8a", fontWeight: 700 }}>
											{item.net >= 0 ? "+" : ""}R$ {item.net.toFixed(0)}
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</section>

				<section
					style={{
						marginTop: 12,
						background: "linear-gradient(145deg, rgba(12,20,31,0.96), rgba(22,28,46,0.94))",
						border: "1px solid rgba(124,153,189,0.26)",
						borderRadius: 16,
						padding: 14,
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
						<div>
							<div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ab3d6" }}>Trade Lab</div>
							<div style={{ fontSize: 14, fontWeight: 700, color: "#e6eef7", marginTop: 3 }}>
								{selectedSignal ? `${selectedSignal.tokenSymbol} · ${selectedSignal.buyLabel} → ${selectedSignal.sellLabel}` : "Selecione um sinal no Command Center"}
							</div>
						</div>
						{simulation && (
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
								<span style={{ fontSize: 11, borderRadius: 999, padding: "3px 10px", background: simulation.viabilityLabel === "Executavel" ? "rgba(31,209,138,0.16)" : simulation.viabilityLabel === "Marginal" ? "rgba(245,158,11,0.2)" : "rgba(255,107,107,0.18)", color: simulation.viabilityLabel === "Executavel" ? "#4be595" : simulation.viabilityLabel === "Marginal" ? "#fbbf24" : "#ff8a8a" }}>
									Viabilidade: {simulation.viabilityLabel}
								</span>
								<span style={{ fontSize: 11, borderRadius: 999, padding: "3px 10px", background: simulation.riskLabel === "Controlado" ? "rgba(31,209,138,0.16)" : simulation.riskLabel === "Moderado" ? "rgba(245,158,11,0.2)" : "rgba(255,107,107,0.18)", color: simulation.riskLabel === "Controlado" ? "#4be595" : simulation.riskLabel === "Moderado" ? "#fbbf24" : "#ff8a8a" }}>
									Risco: {simulation.riskLabel}
								</span>
							</div>
						)}
					</div>

					{selectedSignal ? (
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
							<div style={{ border: "1px solid rgba(124,153,189,0.22)", borderRadius: 12, padding: 10, background: "rgba(13,25,42,0.5)" }}>
								<div style={{ fontSize: 11, color: "#9ab3d6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Simulacao rapida</div>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
									<label style={{ fontSize: 12, color: "#9db0bd" }}>
										Capital (R$)
										<input type="number" min="1" step="100" value={simAmountBrl} onChange={(e) => setSimAmountBrl(e.target.value)} style={{ marginTop: 4, border: "1px solid rgba(124,153,189,0.35)", borderRadius: 8, padding: "6px 8px", width: "100%", background: "rgba(0,0,0,0.2)", color: "#e6eef7" }} />
									</label>
									<label style={{ fontSize: 12, color: "#9db0bd" }}>
										Extra transf. (R$)
										<input type="number" min="0" step="0.5" value={simTransferExtraBrl} onChange={(e) => setSimTransferExtraBrl(e.target.value)} style={{ marginTop: 4, border: "1px solid rgba(124,153,189,0.35)", borderRadius: 8, padding: "6px 8px", width: "100%", background: "rgba(0,0,0,0.2)", color: "#e6eef7" }} />
									</label>
									<label style={{ fontSize: 12, color: "#9db0bd" }}>
										Slippage compra (%)
										<input type="number" min="0" step="0.01" value={simBuySlippagePct} onChange={(e) => setSimBuySlippagePct(e.target.value)} style={{ marginTop: 4, border: "1px solid rgba(124,153,189,0.35)", borderRadius: 8, padding: "6px 8px", width: "100%", background: "rgba(0,0,0,0.2)", color: "#e6eef7" }} />
									</label>
									<label style={{ fontSize: 12, color: "#9db0bd" }}>
										Slippage venda (%)
										<input type="number" min="0" step="0.01" value={simSellSlippagePct} onChange={(e) => setSimSellSlippagePct(e.target.value)} style={{ marginTop: 4, border: "1px solid rgba(124,153,189,0.35)", borderRadius: 8, padding: "6px 8px", width: "100%", background: "rgba(0,0,0,0.2)", color: "#e6eef7" }} />
									</label>
								</div>

								{simulation && (
									<div style={{ marginTop: 10, display: "grid", gap: 6 }}>
										<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12 }}><span style={{ color: "#9db0bd" }}>Entrada ajustada</span><strong style={{ color: "#e6eef7" }}>{money(simulation.adjustedBuy)}</strong></div>
										<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12 }}><span style={{ color: "#9db0bd" }}>Saida ajustada</span><strong style={{ color: "#e6eef7" }}>{money(simulation.adjustedSell)}</strong></div>
										<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12 }}><span style={{ color: "#9db0bd" }}>Ativo apos transferencia</span><strong style={{ color: "#e6eef7" }}>{simulation.assetAfterTransfer.toFixed(4)} {selectedSignal.tokenSymbol}</strong></div>
										<div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 12 }}><span style={{ color: "#9db0bd" }}>Venda minima p/ breakeven</span><strong style={{ color: "#e6eef7" }}>{money(simulation.minSellForBreakEven)}</strong></div>
										<div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: simulation.net >= 0 ? "#4be595" : "#ff8a8a" }}>
											{simulation.net >= 0 ? "+" : ""}R$ {simulation.net.toFixed(2)} ({simulation.netPct.toFixed(3)}%)
										</div>
									</div>
								)}
							</div>

							<div style={{ border: "1px solid rgba(124,153,189,0.22)", borderRadius: 12, padding: 10, background: "rgba(13,25,42,0.5)" }}>
								<div style={{ fontSize: 11, color: "#9ab3d6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Playbook da operacao</div>
								<div style={{ display: "grid", gap: 8 }}>
									<div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(31,209,138,0.1)", border: "1px solid rgba(31,209,138,0.22)" }}>
										<div style={{ fontSize: 11, color: "#86efac", textTransform: "uppercase" }}>1. Entrada</div>
										<div style={{ marginTop: 2, fontSize: 13, color: "#e6eef7", fontWeight: 700 }}>Comprar em {selectedSignal.buyLabel} a {money(selectedSignal.buyPrice)}</div>
										<div style={{ marginTop: 2, fontSize: 12, color: "#9db0bd" }}>Taxa de compra: {selectedSignal.buyFeePct.toFixed(2)}%</div>
									</div>
									<div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.22)" }}>
										<div style={{ fontSize: 11, color: "#7dd3fc", textTransform: "uppercase" }}>2. Transferencia</div>
										<div style={{ marginTop: 2, fontSize: 13, color: "#e6eef7", fontWeight: 700 }}>{selectedSignal.transferNetwork ?? "Sem rede em comum"}</div>
										<div style={{ marginTop: 2, fontSize: 12, color: "#9db0bd" }}>
											Fee: {selectedSignal.transferFeeAsset.toFixed(4)} {selectedSignal.tokenSymbol}
											{selectedSignal.transferNetwork && NETWORK_TRANSFER_ETA_MINUTES[selectedSignal.transferNetwork]
												? ` · ETA ${NETWORK_TRANSFER_ETA_MINUTES[selectedSignal.transferNetwork].min}-${NETWORK_TRANSFER_ETA_MINUTES[selectedSignal.transferNetwork].max} min`
												: ""}
										</div>
									</div>
									<div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(244,114,182,0.1)", border: "1px solid rgba(244,114,182,0.24)" }}>
										<div style={{ fontSize: 11, color: "#f9a8d4", textTransform: "uppercase" }}>3. Saida</div>
										<div style={{ marginTop: 2, fontSize: 13, color: "#e6eef7", fontWeight: 700 }}>Vender em {selectedSignal.sellLabel} a {money(selectedSignal.sellPrice)}</div>
										<div style={{ marginTop: 2, fontSize: 12, color: "#9db0bd" }}>Taxa de venda: {selectedSignal.sellFeePct.toFixed(2)}%</div>
									</div>
								</div>

								<div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
									<div style={{ border: "1px solid rgba(124,153,189,0.22)", borderRadius: 10, padding: 8 }}>
										<div style={{ fontSize: 11, color: "#9ab3d6", marginBottom: 4 }}>Redes em comum</div>
										<div style={{ fontSize: 12, color: "#e6eef7" }}>{selectedSignal.commonNetworks.join(" / ") || "Nenhuma"}</div>
									</div>
									<div style={{ border: "1px solid rgba(124,153,189,0.22)", borderRadius: 10, padding: 8 }}>
										<div style={{ fontSize: 11, color: "#9ab3d6", marginBottom: 4 }}>Viabilidade estrutural</div>
										<div style={{ fontSize: 12, color: selectedSignal.hasNetworkMatch ? "#4be595" : "#ff8a8a" }}>{selectedSignal.hasNetworkMatch ? "Com match de rede" : "Sem match de rede"}</div>
									</div>
								</div>
							</div>
						</div>
					) : (
						<div style={{ color: "#9db0bd", fontSize: 13 }}>Sem sinal selecionado. Clique em um card no Command Center.</div>
					)}
				</section>

				<section
					style={{
						marginTop: 18,
						background: "var(--card)",
						border: "1px solid var(--card-border)",
						borderRadius: 16,
						padding: 16,
						display: "grid",
						gap: 12,
					}}
				>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Token
							<select
								value={selectedTokenId}
								onChange={(e) => setSelectedTokenId(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							>
								<option value={ALL_TOKENS_ID}>Todas (nenhuma especifica)</option>
								{tokenOptions.length === 0 ? (
									<option value="">Sem tokens disponiveis</option>
								) : (
									tokenOptions.map((token) => (
										<option key={token.id} value={token.id}>{token.symbol} · {token.team}</option>
									))
								)}
							</select>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Valor da operacao (R$)
							<input
								type="number"
								min="0"
								step="100"
								value={amountBrl}
								onChange={(e) => setAmountBrl(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							/>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Min spread bruto (%)
							<input
								type="number"
								step="0.01"
								min="-100"
								value={minSpreadPct}
								onChange={(e) => setMinSpreadPct(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							/>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Min lucro liquido (R$)
							<input
								type="number"
								step="1"
								value={minNetProfitBrl}
								onChange={(e) => setMinNetProfitBrl(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							/>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Custo extra transferencia (R$)
							<input
								type="number"
								step="0.5"
								min="0"
								value={transferBufferBrl}
								onChange={(e) => setTransferBufferBrl(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							/>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Rede alvo
							<select
								value="ALL"
								disabled
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							>
								<option value="ALL">Todas (fixo)</option>
							</select>
						</label>
						<label style={{ fontSize: 12, color: "var(--muted)" }}>
							Max rotas exibidas
							<input
								type="number"
								min="1"
								max="100"
								value={maxRows}
								onChange={(e) => setMaxRows(e.target.value)}
								style={{ marginTop: 4, border: "1px solid var(--card-border)", borderRadius: 8, padding: "8px 10px", background: "var(--card)", color: "var(--text)", width: "100%" }}
							/>
						</label>
					</div>

					<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
						<label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
							<input type="checkbox" checked={onlyNetworkMatch} onChange={(e) => setOnlyNetworkMatch(e.target.checked)} />
							Somente rotas com match de rede
						</label>
						<label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
							<input type="checkbox" checked={onlyPositive} onChange={(e) => setOnlyPositive(e.target.checked)} />
							Somente lucro positivo
						</label>
					</div>

					<button
						onClick={() => setShowFees((current) => !current)}
						style={{
							width: "fit-content",
							border: "1px solid var(--card-border)",
							borderRadius: 10,
							padding: "8px 14px",
							background: "transparent",
							color: "var(--muted)",
							cursor: "pointer",
							fontSize: 13,
						}}
					>
						{showFees ? "▲ Ocultar taxas" : "▼ Editar taxas por exchange"}
					</button>

					{showFees && (
						<div style={{ marginTop: 2, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
							{ORDER.map((key) => {
								const exLabel = exchangeLabelByKey.get(key);
								if (!exLabel) return null;
								const fees = customFees[key] ?? { buy: 0.1, sell: 0.1 };
								return (
									<div key={key} style={{ padding: "10px 12px", border: "1px solid var(--card-border)", borderRadius: 10, background: "var(--card)" }}>
										<div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{exLabel}</div>
										<div style={{ display: "flex", gap: 8 }}>
											<label style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>
												Compra (%)
												<input
													type="number"
													step="0.01"
													min="0"
													max="100"
													value={fees.buy}
													onChange={(e) =>
														setCustomFees((prev) => ({ ...prev, [key]: { ...prev[key], buy: parseFloat(e.target.value) || 0 } }))
													}
													style={{ marginTop: 4, display: "block", border: "1px solid var(--card-border)", borderRadius: 6, padding: "5px 8px", background: "var(--bg)", color: "var(--text)", fontSize: 12, width: "100%" }}
												/>
											</label>
											<label style={{ flex: 1, fontSize: 11, color: "var(--muted)" }}>
												Venda (%)
												<input
													type="number"
													step="0.01"
													min="0"
													max="100"
													value={fees.sell}
													onChange={(e) =>
														setCustomFees((prev) => ({ ...prev, [key]: { ...prev[key], sell: parseFloat(e.target.value) || 0 } }))
													}
													style={{ marginTop: 4, display: "block", border: "1px solid var(--card-border)", borderRadius: 6, padding: "5px 8px", background: "var(--bg)", color: "var(--text)", fontSize: 12, width: "100%" }}
												/>
											</label>
										</div>
									</div>
								);
							})}
						</div>
					)}

					<div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
						<button
							onClick={() => setEnabledExchanges(Object.fromEntries(ORDER.map((key) => [key, true])) as Record<string, boolean>)}
							style={{ border: "1px solid var(--card-border)", borderRadius: 999, padding: "6px 10px", background: "var(--card)", color: "var(--text)", fontSize: 12, cursor: "pointer" }}
						>
							Marcar todas
						</button>
						<button
							onClick={() => setEnabledExchanges(Object.fromEntries(ORDER.map((key) => [key, false])) as Record<string, boolean>)}
							style={{ border: "1px solid var(--card-border)", borderRadius: 999, padding: "6px 10px", background: "var(--card)", color: "var(--text)", fontSize: 12, cursor: "pointer" }}
						>
							Limpar todas
						</button>
						{ORDER.map((key) => {
							const enabled = enabledExchanges[key] ?? true;
							const exLabel = exchangeLabelByKey.get(key) ?? key;
							return (
								<button
									key={key}
									onClick={() => setEnabledExchanges((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))}
									style={{
										border: "1px solid var(--card-border)",
										borderRadius: 999,
										padding: "6px 10px",
										background: enabled ? "rgba(24,201,122,0.12)" : "transparent",
										color: enabled ? "var(--ok)" : "var(--muted)",
										fontSize: 12,
										cursor: "pointer",
									}}
								>
									{enabled ? "ON" : "OFF"} {exLabel}
								</button>
							);
						})}
					</div>
				</section>

				<section
					style={{
						marginTop: 12,
						background: "var(--card)",
						border: "1px solid var(--card-border)",
						borderRadius: 16,
						padding: 12,
					}}
				>
					<div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
						Moedas com viabilidade
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
						{viabilityCards.map(({ token, best, viable }) => {
							const isSelected = selectedTokenId === token.id;
							return (
								<button
									key={token.id}
									onClick={() => setSelectedTokenId(token.id)}
									style={{
										textAlign: "left",
										border: isSelected ? "1px solid var(--ok)" : "1px solid var(--card-border)",
										borderRadius: 12,
										padding: 10,
										background: isSelected ? "rgba(24,201,122,0.08)" : "var(--bg)",
										color: "var(--text)",
										cursor: "pointer",
									}}
								>
									<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
										<div style={{ fontWeight: 700 }}>{token.symbol}</div>
										<div style={{
											fontSize: 11,
											padding: "2px 8px",
											borderRadius: 999,
											background: viable ? "rgba(24,201,122,0.12)" : "rgba(255,255,255,0.06)",
											color: viable ? "var(--ok)" : "var(--muted)",
										}}>
											{viable ? "Viavel" : "Sem viabilidade"}
										</div>
									</div>
									<div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>{token.team}</div>
									<div style={{ marginTop: 8, fontSize: 12 }}>
										{best ? (
											<>
												<div style={{ color: best.netProfitBrl >= 0 ? "var(--ok)" : "var(--error)", fontWeight: 700 }}>
													{best.netProfitBrl >= 0 ? "+" : ""}R$ {best.netProfitBrl.toFixed(2)}
												</div>
												<div style={{ marginTop: 2, color: "var(--muted)" }}>{best.buyLabel} → {best.sellLabel}</div>
												<div style={{ marginTop: 2, color: "var(--muted)" }}>Spread {best.grossSpreadPct.toFixed(3)}%</div>
											</>
										) : (
											<div style={{ color: "var(--muted)" }}>Nenhuma rota com os filtros atuais</div>
										)}
									</div>
								</button>
							);
						})}
					</div>
				</section>

				<section
					style={{
						marginTop: 12,
						background: "var(--card)",
						border: "1px solid var(--card-border)",
						borderRadius: 16,
						padding: 14,
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: 10,
					}}
				>
					<div>
						<div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rotas</div>
						<div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>{summary.total}</div>
					</div>
					<div>
						<div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lucrativas</div>
						<div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: "var(--ok)" }}>{summary.profitable}</div>
					</div>
					<div>
						<div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Com match de rede</div>
						<div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>{summary.withNetworkMatch}</div>
					</div>
					<div>
						<div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Melhor indice</div>
						<div style={{ marginTop: 4, fontSize: 16, fontWeight: 700 }}>{summary.best ? summary.best.score.toFixed(2) : "-"}</div>
					</div>
				</section>

				<section
					style={{
						marginTop: 12,
						background: "var(--card)",
						border: "1px solid var(--card-border)",
						borderRadius: 16,
						padding: 12,
						overflowX: "auto",
					}}
				>
					<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, fontSize: 13 }}>
						<thead>
							<tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)" }}>
								<th style={{ padding: "8px 6px" }}>#</th>
								<th style={{ padding: "8px 6px" }}>Ativo</th>
								<th style={{ padding: "8px 6px" }}>Compra</th>
								<th style={{ padding: "8px 6px" }}>Venda</th>
								<th style={{ padding: "8px 6px" }}>Rede</th>
								<th style={{ padding: "8px 6px" }}>Spread</th>
								<th style={{ padding: "8px 6px" }}>Lucro liquido</th>
								<th style={{ padding: "8px 6px" }}>Liquidez (24h)</th>
								<th style={{ padding: "8px 6px" }}>Score</th>
							</tr>
						</thead>
						<tbody>
							{rows.length === 0 ? (
								<tr>
									<td colSpan={9} style={{ padding: "12px 6px", color: "var(--muted)" }}>
										Nenhuma rota bateu nos filtros atuais.
									</td>
								</tr>
							) : (
								rows.map((row, index) => (
									<tr key={row.key} style={{ borderBottom: "1px solid var(--card-border)" }}>
										<td style={{ padding: "8px 6px" }}>{index + 1}</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ fontWeight: 700 }}>{row.tokenSymbol}</div>
											<div style={{ color: "var(--muted)", marginTop: 2 }}>{row.tokenTeam}</div>
										</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ fontWeight: 700 }}>{row.buyLabel}</div>
											<div style={{ color: "var(--muted)", marginTop: 2 }}>{money(row.buyPrice)} · taxa {row.buyFeePct.toFixed(2)}%</div>
										</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ fontWeight: 700 }}>{row.sellLabel}</div>
											<div style={{ color: "var(--muted)", marginTop: 2 }}>{money(row.sellPrice)} · taxa {row.sellFeePct.toFixed(2)}%</div>
										</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ fontWeight: 700, color: row.hasNetworkMatch ? "var(--ok)" : "var(--error)" }}>{row.transferNetwork ?? "Sem match"}</div>
											<div style={{ color: "var(--muted)", marginTop: 2 }}>Fee: {row.transferFeeAsset.toFixed(4)} {row.tokenSymbol}</div>
										</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ color: row.grossSpreadPct >= 0 ? "var(--ok)" : "var(--error)", fontWeight: 700 }}>
												{row.grossSpreadPct >= 0 ? "+" : ""}
												{row.grossSpreadPct.toFixed(3)}%
											</div>
											<div style={{ color: "var(--muted)", marginTop: 2 }}>{row.commonNetworks.join(" / ") || "-"}</div>
										</td>
										<td style={{ padding: "8px 6px" }}>
											<div style={{ color: row.netProfitBrl >= 0 ? "var(--ok)" : "var(--error)", fontWeight: 700 }}>
												{row.netProfitBrl >= 0 ? "+" : ""}
												R$ {row.netProfitBrl.toFixed(2)}
											</div>
											<div style={{ color: row.netProfitPct >= 0 ? "var(--ok)" : "var(--error)", marginTop: 2 }}>
												{row.netProfitPct >= 0 ? "+" : ""}
												{row.netProfitPct.toFixed(3)}% · {row.assetAfterTransfer.toFixed(4)} {row.tokenSymbol}
											</div>
										</td>
										<td style={{ padding: "8px 6px" }}>{vol(row.liquidityBrl)}</td>
										<td style={{ padding: "8px 6px", fontWeight: 700 }}>{row.score.toFixed(2)}</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</section>
			</div>
		</main>
	);
}
