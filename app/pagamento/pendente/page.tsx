"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PendenteContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "linear-gradient(135deg, var(--bg-grad-1) 0%, var(--bg) 50%, var(--bg-grad-2) 100%)",
    }}>
      <div style={{
        maxWidth: 480,
        width: "100%",
        background: "var(--card)",
        border: "1.5px solid rgba(234, 179, 8, 0.3)",
        borderRadius: 24,
        padding: 40,
        textAlign: "center",
        boxShadow: "0 20px 40px rgba(234, 179, 8, 0.08)",
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(234, 179, 8, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 36,
        }}>
          ⏳
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: "#eab308" }}>
          Pagamento Pendente
        </h1>

        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 15, lineHeight: 1.6 }}>
          Seu pagamento está sendo processado. Assim que confirmado, seu acesso será liberado automaticamente.
        </p>

        <p style={{ margin: "0 0 24px", color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          Se pagou via PIX, o processo é quase instantâneo. Caso demore mais de alguns minutos, entre em contato pelo Telegram.
        </p>

        {paymentId && (
          <p style={{ margin: "0 0 24px", fontSize: 12, color: "var(--muted)" }}>
            ID: <code style={{ color: "var(--text)" }}>{paymentId}</code>
          </p>
        )}

        <div style={{ display: "grid", gap: 12 }}>
          <a
            href="/login"
            style={{
              display: "block",
              padding: "14px 20px",
              background: "linear-gradient(135deg, var(--accent), #0284c7)",
              color: "white",
              borderRadius: 14,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Tentar Login
          </a>
          <a
            href="https://t.me/+5543999027395"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              padding: "14px 20px",
              background: "transparent",
              color: "var(--text)",
              borderRadius: 14,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              border: "1.5px solid var(--card-border)",
            }}
          >
            💬 Suporte no Telegram
          </a>
        </div>
      </div>
    </main>
  );
}

export default function PagamentoPendente() {
  return (
    <Suspense>
      <PendenteContent />
    </Suspense>
  );
}
