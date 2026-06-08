"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SucessoContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          window.location.href = "/login";
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        border: "1.5px solid rgba(34, 197, 94, 0.3)",
        borderRadius: 24,
        padding: 40,
        textAlign: "center",
        boxShadow: "0 20px 40px rgba(34, 197, 94, 0.1)",
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(34, 197, 94, 0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 36,
        }}>
          ✅
        </div>

        <h1 style={{
          margin: "0 0 12px",
          fontSize: 26,
          fontWeight: 800,
          color: "#22c55e",
        }}>
          Pagamento Confirmado!
        </h1>

        <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 15, lineHeight: 1.6 }}>
          Seu acesso foi liberado com sucesso. Faça login para começar a usar a plataforma.
        </p>

        {paymentId && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted)" }}>
            ID do pagamento: <code style={{ color: "var(--text)" }}>{paymentId}</code>
          </p>
        )}

        <div style={{
          margin: "24px 0",
          padding: "14px 20px",
          background: "rgba(34, 197, 94, 0.08)",
          border: "1px solid rgba(34, 197, 94, 0.2)",
          borderRadius: 12,
          fontSize: 14,
          color: "var(--muted)",
        }}>
          Redirecionando para o login em <strong style={{ color: "var(--text)" }}>{seconds}s</strong>...
        </div>

        <a
          href="/login"
          style={{
            display: "block",
            padding: "14px 20px",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "white",
            borderRadius: 14,
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 15,
            transition: "all 0.3s ease",
          }}
        >
          Fazer Login Agora
        </a>
      </div>
    </main>
  );
}

export default function PagamentoSucesso() {
  return (
    <Suspense>
      <SucessoContent />
    </Suspense>
  );
}
