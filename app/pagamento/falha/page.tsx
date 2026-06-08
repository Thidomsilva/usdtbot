"use client";

import { Suspense } from "react";

function FalhaContent() {
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
        border: "1.5px solid rgba(185, 28, 28, 0.3)",
        borderRadius: 24,
        padding: 40,
        textAlign: "center",
        boxShadow: "0 20px 40px rgba(185, 28, 28, 0.08)",
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(185, 28, 28, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 36,
        }}>
          ❌
        </div>

        <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: "var(--error)" }}>
          Pagamento não Aprovado
        </h1>

        <p style={{ margin: "0 0 24px", color: "var(--muted)", fontSize: 15, lineHeight: 1.6 }}>
          Seu pagamento não foi aprovado. Isso pode ter ocorrido por saldo insuficiente, dados incorretos ou recusa do banco. Tente novamente.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <a
            href="/planos"
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
            Tentar Novamente
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

export default function PagamentoFalha() {
  return (
    <Suspense>
      <FalhaContent />
    </Suspense>
  );
}
