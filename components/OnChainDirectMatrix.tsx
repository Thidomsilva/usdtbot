import type { OnChainMatrixResponse } from "@/lib/polygon-brl-onchain";

type Props = {
  data: OnChainMatrixResponse | null;
  loading: boolean;
  error: string | null;
  lotBrl: number;
  thresholdPct: number;
};

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}%`;
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OnChainDirectMatrix({ data, loading, error, lotBrl, thresholdPct }: Props) {
  const rows = data?.rows ?? [];
  const alerts = rows.filter((row) => row.status === "ok" && Math.abs(row.deviationPct) >= thresholdPct);

  return (
    <section
      style={{
        marginTop: 12,
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 16,
        boxShadow: "var(--shadow)",
        padding: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Arbitragem On-Chain Direta (BRL)</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
            Simulação de lote {money(lotBrl)} BRL, com corte de alerta em {thresholdPct.toFixed(2)}%.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
          <span>{data ? `${data.summary.poolsFound} pool(s) encontrado(s)` : "Aguardando consulta"}</span>
          <span>·</span>
          <span>{alerts.length} alerta(s)</span>
          <span>·</span>
          <span>{data ? data.rpcUrl : "RPC Polygon"}</span>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444" }}>Erro: {error}</div>}
      {data?.warning && <div style={{ marginTop: 10, fontSize: 12, color: "#f59e0b" }}>Aviso: {data.warning}</div>}
      {loading && <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>Consultando pools em Polygon...</div>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: 12 }}>
              <th style={{ padding: "10px 8px" }}>Par on-chain</th>
              <th style={{ padding: "10px 8px" }}>Pool / Protocolo</th>
              <th style={{ padding: "10px 8px" }}>Taxa direta</th>
              <th style={{ padding: "10px 8px" }}>Descolamento</th>
              <th style={{ padding: "10px 8px" }}>Slippage do lote</th>
              <th style={{ padding: "10px 8px" }}>TVL da pool</th>
              <th style={{ padding: "10px 8px" }}>Sinal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isAlert = row.status === "ok" && Math.abs(row.deviationPct) >= thresholdPct;
              const highlightClass = row.alertSide === "buy" ? "onchain-flash-buy" : row.alertSide === "sell" ? "onchain-flash-sell" : "";
              return (
                <tr
                  key={`${row.pair}-${row.protocol}-${row.poolAddress}`}
                  className={highlightClass}
                  style={{
                    borderBottom: "1px solid var(--card-border)",
                    fontSize: 13,
                    background: isAlert ? (row.alertSide === "buy" ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)") : "transparent",
                  }}
                >
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 800 }}>{row.pair}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {row.sourceToken} → {row.targetToken}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div>{row.protocol}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", overflowWrap: "anywhere" }}>{row.poolAddress}</div>
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>
                    {row.status === "ok" ? `1 ${row.sourceToken} = ${row.directRate.toFixed(6)} ${row.targetToken}` : "--"}
                  </td>
                  <td
                    style={{
                      padding: "10px 8px",
                      color: row.deviationPct >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: 700,
                    }}
                  >
                    {row.status === "ok" ? pct(row.deviationPct) : "--"}
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)" }}>
                    {row.status === "ok" ? pct(row.slippagePct) : "--"}
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>
                    {row.status === "ok" ? `R$ ${money(row.tvlBrl)}` : "--"}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        border: `1px solid ${row.alertSide === "buy" ? "#22c55e" : row.alertSide === "sell" ? "#ef4444" : "var(--card-border)"}`,
                        color: row.alertSide === "buy" ? "#22c55e" : row.alertSide === "sell" ? "#ef4444" : "var(--muted)",
                        borderRadius: 999,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {row.status === "ok" ? (row.alertSide === "buy" ? "COMPRA" : row.alertSide === "sell" ? "VENDA" : "OBSERVAR") : "INDISPONIVEL"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "14px 8px", color: "var(--muted)", fontSize: 13 }}>
                  Nenhuma pool encontrada com a configuração atual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
