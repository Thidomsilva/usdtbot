import React from "react";

interface OpportunityCardProps {
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
  capital?: number;
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
}

export default function OpportunityCard(props: OpportunityCardProps) {
  const spreadColor = props.profitPercent > 1 ? "#16a34a" : props.profitPercent > 0 ? "#ca8a04" : "#dc2626";

  const formatPrice = (value: number, currency: "BRL" | "USDT" = "USDT") => {
    if (!Number.isFinite(value)) return "-";
    const decimals = value < 0.01 ? 6 : value < 1 ? 4 : 2;
    if (currency === "BRL") return `R$ ${value.toFixed(decimals)}`;
    return `${value.toFixed(decimals)} USDT`;
  };

  const formatCompact = (value: number) => {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCompactWithCurrency = (value: number, currency: "BRL" | "USDT" = "USDT") => {
    if (currency === "BRL") return `R$ ${formatCompact(value)}`;
    return `${formatCompact(value)} USDT`;
  };

  const askCurrency = props.askCurrency ?? "USDT";
  const bidCurrency = props.bidCurrency ?? "USDT";
  const profitCurrency = props.profitCurrency ?? "USDT";
  const buyBookCurrency = props.buyBookCurrency ?? askCurrency;
  const sellBookCurrency = props.sellBookCurrency ?? bidCurrency;

  return (
    <article
      style={{
        border: `1px solid ${spreadColor}44`,
        borderRadius: 14,
        background: "var(--card)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid var(--card-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>{props.asset}</strong>
              <span
                style={{
                  fontSize: 11,
                  borderRadius: 999,
                  padding: "2px 8px",
                  border: `1px solid ${spreadColor}`,
                  color: spreadColor,
                  fontWeight: 700,
                }}
              >
                {props.profitPercent.toFixed(2)}% liquido
              </span>
              {props.network && (
                <span
                  style={{
                    fontSize: 11,
                    borderRadius: 999,
                    padding: "2px 8px",
                    border: "1px solid var(--card-border)",
                    color: "var(--muted)",
                  }}
                >
                  Rede {props.network}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {props.fromExchange} → {props.toExchange}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Lucro estimado</div>
            <div style={{ fontWeight: 800, color: spreadColor }}>+{formatCompactWithCurrency(props.profit, profitCurrency)}</div>
            {props.capital && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Simulacao {props.capital} USDT
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Preco de compra (ask)</div>
            <div style={{ fontWeight: 700 }}>{formatPrice(props.ask, askCurrency)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{props.fromExchange}</div>
          </div>
          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Preco de venda (bid)</div>
            <div style={{ fontWeight: 700 }}>{formatPrice(props.bid, bidCurrency)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{props.toExchange}</div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          Taxas: compra {props.fees.buy}% · saque {props.fees.withdraw}% · venda {props.fees.sell}%
          <br />
          Liquidez estimada: {props.liquidity} USDT
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Estrategia:</strong> {props.playbook.join(" · ")}
        </div>

        {(props.buyBookTop?.length || 0) > 0 && (
          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 10,
              padding: "10px",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--text)" }}>Book de compra ({props.fromExchange})</strong>
              <span> · top {props.buyBookTop?.length} asks</span>
            </div>
            {(props.buyBookTop || []).map((level, idx) => (
              <div key={`buy-${idx}`} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: 8, marginBottom: 3 }}>
                <span>#{idx + 1}</span>
                <span>preco {formatPrice(level.priceBrl, buyBookCurrency)}</span>
                <span>qtd {formatCompact(level.amount)}</span>
              </div>
            ))}
            <div style={{ marginTop: 6 }}>
              Cobertura acumulada: {formatCompactWithCurrency(props.buyBookCoverageBrl ?? 0, buyBookCurrency)}
            </div>
          </div>
        )}

        {(props.sellBookTop?.length || 0) > 0 && (
          <div
            style={{
              border: "1px solid var(--card-border)",
              borderRadius: 10,
              padding: "10px",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: "var(--text)" }}>Book de venda ({props.toExchange})</strong>
              <span> · top {props.sellBookTop?.length} bids</span>
            </div>
            {(props.sellBookTop || []).map((level, idx) => (
              <div key={`sell-${idx}`} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: 8, marginBottom: 3 }}>
                <span>#{idx + 1}</span>
                <span>preco {formatPrice(level.priceBrl, sellBookCurrency)}</span>
                <span>qtd {formatCompact(level.amount)}</span>
              </div>
            ))}
            <div style={{ marginTop: 6 }}>
              Cobertura acumulada: {formatCompactWithCurrency(props.sellBookCoverageBrl ?? 0, sellBookCurrency)}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
