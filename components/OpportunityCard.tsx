import React from "react";

interface OpportunityCardProps {
  asset: string;
  fromExchange: string;
  fromLogo?: string;
  toExchange: string;
  toLogo?: string;
  ask: number;
  bid: number;
  network: string;
  networkLogo?: string;
  fees: { buy: number; withdraw: number; sell: number };
  liquidity: number;
  profit: number;
  profitPercent: number;
  playbook: string[];
  capital?: number;
}

export default function OpportunityCard(props: OpportunityCardProps) {
  const spreadColor = props.profitPercent > 1 ? "#16a34a" : props.profitPercent > 0 ? "#ca8a04" : "#dc2626";

  const formatPrice = (value: number) => {
    if (!Number.isFinite(value)) return "-";
    if (value < 0.01) return value.toFixed(6);
    if (value < 1) return value.toFixed(4);
    return value.toFixed(2);
  };

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
            <div style={{ fontWeight: 800, color: spreadColor }}>+{props.profit.toFixed(2)} USDT</div>
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
            <div style={{ fontWeight: 700 }}>{formatPrice(props.ask)}</div>
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
            <div style={{ fontWeight: 700 }}>{formatPrice(props.bid)}</div>
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
      </div>
    </article>
  );
}
