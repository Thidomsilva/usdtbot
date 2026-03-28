"use client";
import { usePrices } from "../lib/usePrices";
import type { ExchangeData, Summary } from "../lib/types";

const EXCHANGE_ORDER = [
  "binance",
  "kucoin",
  "novadax",
  "mercadobitcoin",
];

function fmt(n: number, decimals = 4) {
  return n.toFixed(decimals);
}

function fmtVol(n: number) {
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}K`;
  return `R$ ${n.toFixed(0)}`;
}

function ChangeChip({ value }: { value?: number }) {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 7px",
        borderRadius: 100,
        backgroundColor: pos ? "#dcfce7" : "#fee2e2",
        color: pos ? "#166534" : "#991b1b",
      }}
    >
      {pos ? "+" : ""}
      {value.toFixed(4)}%
    </span>
  );
}

function ExchangeCard({
  id,
  data,
  isMin,
  isMax,
}: {
  id: string;
  data: ExchangeData;
  isMin: boolean;
  isMax: boolean;
}) {
  const ok = data.status === "ok";
  return (
    <div
      style={{
        background: "#fff",
        border: isMin
          ? "1.5px solid #22c55e"
          : isMax
          ? "1.5px solid #f97316"
          : "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "18px 20px",
        position: "relative",
        transition: "box-shadow 0.15s",
      }}
    >
      {/* top badge */}
      {isMin && (
        <span className="badge" style={{ background: "#dcfce7", color: "#166534" }}>
          menor
        </span>
      )}
      {isMax && (
        <span className="badge" style={{ background: "#ffedd5", color: "#9a3412" }}>
          maior
        </span>
      )}

      {/* exchange name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{data.flag}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
          {data.label}
        </span>
        {ok && (
          <span
            style={{
              marginLeft: "auto",
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
            }}
          />
        )}
        {!ok && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#ef4444",
              fontWeight: 500,
            }}
          >
            erro
          </span>
        )}
      </div>

      {ok ? (
        <>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" }}>
            R$ {fmt(data.price_brl ?? 0)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <ChangeChip value={data.change_24h} />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{data.pair}</span>
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid #f3f4f6",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            <Stat label="Máx 24h" value={`R$ ${fmt(data.high_24h ?? 0)}`} />
            <Stat label="Mín 24h" value={`R$ ${fmt(data.low_24h ?? 0)}`} />
            <Stat label="Volume 24h" value={fmtVol(data.volume_24h ?? 0)} />
            {data.source_url && (
              <a
                href={data.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: "#6366f1", textDecoration: "none", alignSelf: "end" }}
              >
                Ver corretora ↗
              </a>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
          Não foi possível obter o preço.
          <br />
          <span style={{ fontSize: 11 }}>{data.error}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{value}</div>
    </div>
  );
}

function SummaryBar({ summary }: { summary: Summary }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <SumCard label="Média atual" value={`R$ ${fmt(summary.avg)}`} accent="#6366f1" />
      <SumCard label="Menor preço" value={`R$ ${fmt(summary.min)}`} sub={summary.min_exchange} accent="#22c55e" />
      <SumCard label="Maior preço" value={`R$ ${fmt(summary.max)}`} sub={summary.max_exchange} accent="#f97316" />
      <SumCard
        label="Spread total"
        value={`${summary.spread_pct.toFixed(4)}%`}
        accent={summary.spread_pct > 0.05 ? "#ef4444" : "#22c55e"}
      />
    </div>
  );
}

function SumCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Home() {
  const { data, loading, lastUpdated, countdown, refresh } = usePrices();

  const ok = data?.exchanges
    ? Object.values(data.exchanges).filter((e) => e.status === "ok")
    : [];
  const minPrice = data?.summary?.min;
  const maxPrice = data?.summary?.max;

  return (
    <main style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Geist', 'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-0.5px" }}>
                USDT — Tracker de Preço
              </h1>
              <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Monitoramento em tempo real do par USDT/BRL
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {lastUpdated && (
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  Atualizado às {lastUpdated.toLocaleTimeString("pt-BR")} · próximo em {countdown}s
                </span>
              )}
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  fontSize: 13,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: loading ? "#f3f4f6" : "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#374151",
                  fontWeight: 500,
                }}
              >
                {loading ? "Atualizando..." : "↻ Atualizar"}
              </button>
            </div>
          </div>

          {/* live dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: loading ? "#fbbf24" : "#22c55e",
                animation: "pulse 2s infinite",
              }}
            />
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {loading
                ? "Consultando corretoras..."
                : `${ok.length} de ${EXCHANGE_ORDER.length} corretoras responderam`}
            </span>
          </div>
        </div>

        {/* Summary bar */}
        {data?.summary && Object.keys(data.summary).length > 0 && (
          <SummaryBar summary={data.summary} />
        )}

        {/* Cards grid */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 14 }}>
            Carregando preços...
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {data &&
            EXCHANGE_ORDER.map((id) => {
              const ex = data.exchanges[id];
              if (!ex) return null;
              return (
                <ExchangeCard
                  key={id}
                  id={id}
                  data={ex}
                  isMin={ex.status === "ok" && ex.price_brl === minPrice}
                  isMax={ex.status === "ok" && ex.price_brl === maxPrice}
                />
              );
            })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            Todos os monitoramentos usam somente o par USDT/BRL
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            Atualização automática a cada 30s
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .badge {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 11px;
          padding: 2px 9px;
          border-radius: 100px;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
