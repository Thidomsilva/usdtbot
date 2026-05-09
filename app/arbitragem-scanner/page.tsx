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

const DEFAULT_TRANSFER_FEE_ASSET = 1;

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
	const [countdown, setCountdown] = useState(REFRESH_SECONDS);
	const [selectedTokenId, setSelectedTokenId] = useState("");
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
		const t1 = setInterval(load, REFRESH_SECONDS * 1000);
		const t2 = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
		return () => {
			clearInterval(t1);
			clearInterval(t2);
		};
	}, []);

	const tokenOptions = useMemo(() => {
		if (!data?.tokens) return [] as FanTokenRow[];
		return data.tokens
			.filter((token) => token.status === "ok" && token.symbol !== "USDT")
			.filter((token) => (token.exchanges ?? []).some((quote) => quote.status === "ok" && (quote.ask_price_brl ?? 0) > 0 && (quote.bid_price_brl ?? 0) > 0))
			.sort((a, b) => a.symbol.localeCompare(b.symbol));
	}, [data]);

	useEffect(() => {
		if (tokenOptions.length === 0) return;
		if (!selectedTokenId || !tokenOptions.some((token) => token.id === selectedTokenId)) {
			setSelectedTokenId(tokenOptions[0].id);
		}
	}, [tokenOptions, selectedTokenId]);

	const selectedToken = useMemo(
		() => tokenOptions.find((token) => token.id === selectedTokenId) ?? null,
		[tokenOptions, selectedTokenId]
	);

	const okCards = useMemo(() => {
		if (!selectedToken) return [];
		return (selectedToken.exchanges ?? [])
			.filter((ex) => ORDER.includes(ex.exchange) && ex.status === "ok" && (ex.ask_price_brl ?? 0) > 0 && (ex.bid_price_brl ?? 0) > 0)
			.map((ex) => ({ key: ex.exchange, ex }));
	}, [selectedToken]);

	const exchangeLabelByKey = useMemo(() => {
		const labels = new Map<string, string>();
		for (const exchange of selectedToken?.exchanges ?? []) {
			labels.set(exchange.exchange, exchange.label);
		}
		return labels;
	}, [selectedToken]);

	const rows = useMemo(() => {
		const amount = parseFloat(amountBrl);
		if (!Number.isFinite(amount) || amount <= 0) return [] as ScreenerRow[];

		const minSpread = parseFloat(minSpreadPct) || 0;
		const minNetProfit = parseFloat(minNetProfitBrl) || 0;
		const transferBuffer = parseFloat(transferBufferBrl) || 0;
		const max = Math.max(1, Math.min(100, parseInt(maxRows || "20", 10) || 20));

		const selected = okCards.filter(({ key }) => enabledExchanges[key] ?? true);
		const list: ScreenerRow[] = [];

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
					key: `${buy.key}__${sell.key}__${transferNetwork ?? "none"}`,
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

		return list
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if (b.netProfitBrl !== a.netProfitBrl) return b.netProfitBrl - a.netProfitBrl;
				return b.liquidityBrl - a.liquidityBrl;
			})
			.slice(0, max);
	}, [
		amountBrl,
		minSpreadPct,
		minNetProfitBrl,
		transferBufferBrl,
		maxRows,
		onlyNetworkMatch,
		onlyPositive,
		okCards,
		enabledExchanges,
		customFees,
	]);

	const summary = useMemo(() => {
		const total = rows.length;
		const profitable = rows.filter((row) => row.netProfitBrl > 0).length;
		const withNetworkMatch = rows.filter((row) => row.hasNetworkMatch).length;
		const best = rows[0] ?? null;
		return { total, profitable, withNetworkMatch, best };
	}, [rows]);

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
				</header>

				<div style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
					{selectedToken
						? `${okCards.length} de ${(selectedToken.exchanges ?? []).filter((exchange) => ORDER.includes(exchange.exchange)).length} corretoras com livro para ${selectedToken.symbol}`
						: "Carregando tokens..."} · proxima atualizacao em {countdown}s
				</div>

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
									<td colSpan={8} style={{ padding: "12px 6px", color: "var(--muted)" }}>
										Nenhuma rota bateu nos filtros atuais.
									</td>
								</tr>
							) : (
								rows.map((row, index) => (
									<tr key={row.key} style={{ borderBottom: "1px solid var(--card-border)" }}>
										<td style={{ padding: "8px 6px" }}>{index + 1}</td>
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
											<div style={{ color: "var(--muted)", marginTop: 2 }}>Fee: {row.transferFeeAsset.toFixed(4)} {selectedToken?.symbol ?? "ATIVO"}</div>
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
												{row.netProfitPct.toFixed(3)}% · {row.assetAfterTransfer.toFixed(4)} {selectedToken?.symbol ?? "ATIVO"}
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
