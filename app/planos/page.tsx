"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const PLANOS = [
  {
    key: "weekly" as const,
    badge: "Mais acessado",
    label: "Plano Semanal",
    price: "R$ 12,99",
    period: "por semana",
    days: 7,
    features: [
      "Acesso completo ao Scanner de Arbitragem",
      "Monitoramento P2P em tempo real",
      "Oportunidades Spot-Futures",
      "Arbitragem Depeg de Stablecoins",
      "Fan Tokens Tracker",
      "Suporte por Telegram",
    ],
    highlight: false,
  },
  {
    key: "monthly" as const,
    badge: "Melhor custo-benefício",
    label: "Plano Mensal",
    price: "R$ 34,99",
    period: "por mês",
    days: 30,
    features: [
      "Tudo do plano semanal",
      "Economia de 33% vs semanal",
      "30 dias de acesso ininterrupto",
      "Atualizações em tempo real",
      "Alertas automáticos ilimitados",
      "Prioridade no suporte",
    ],
    highlight: true,
  },
];

export default function PlanosPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<"weekly" | "monthly" | null>(null);
  const [sessionUser, setSessionUser] = useState<{ username: string; email: string | null; role: "admin" | "user" } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", { credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));

        if (cancelled) {
          return;
        }

        if (response.ok && payload?.authenticated && payload?.user) {
          setSessionUser({
            username: String(payload.user.username ?? ""),
            email: payload.user.email ?? null,
            role: payload.user.role === "admin" ? "admin" : "user",
          });
        } else {
          setSessionUser(null);
        }
      } catch {
        if (!cancelled) {
          setSessionUser(null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const isExistingUser = Boolean(sessionUser);
  const isNewUser = !isExistingUser;

  async function handleCheckout() {
    if (!selectedPlan) {
      setError("Selecione um plano para continuar.");
      return;
    }

    if (sessionLoading) {
      setError("Aguardando validação da sua sessão. Tente novamente em instantes.");
      return;
    }

    if (isNewUser) {
      if (!email || !password || !confirmPassword) {
        setError("Preencha todos os campos.");
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
      if (password.length < 6) {
        setError("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, string> = { planKey: selectedPlan };
      if (isNewUser) {
        body.email = email;
        body.password = password;
      }

      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Erro ao iniciar pagamento.");
        return;
      }

      // Redireciona para o checkout do Mercado Pago
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--bg-grad-1) 0%, var(--bg) 50%, var(--bg-grad-2) 100%)",
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .plan-card {
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .plan-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(14, 165, 233, 0.15);
        }
        .plan-card.selected {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3), 0 20px 40px rgba(14, 165, 233, 0.15);
        }
        input:focus { outline: none; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1), 0 0 0 1.5px var(--accent); }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48, animation: "fadeIn 0.6s ease-out" }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(14, 165, 233, 0.1)",
          border: "1px solid rgba(14, 165, 233, 0.3)",
          borderRadius: 100,
          padding: "6px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--accent)",
          fontWeight: 600,
        }}>
          🔒 Acesso Seguro e Criptografado
        </div>
        <h1 style={{
          margin: 0,
          fontSize: "clamp(28px, 5vw, 42px)",
          fontWeight: 800,
          background: "linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1.2,
        }}>
          Escolha seu Plano
        </h1>
        <p style={{
          marginTop: 12,
          color: "var(--muted)",
          fontSize: 16,
          maxWidth: 520,
          lineHeight: 1.6,
        }}>
          {isExistingUser
            ? "Sua conta já está reconhecida. Selecione o plano para renovar o acesso sem criar outro cadastro."
            : "Acesse o scanner de arbitragem em tempo real, oportunidades P2P, Spot-Futures e muito mais."}
        </p>
        {isExistingUser && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(34, 197, 94, 0.25)",
            background: "rgba(34, 197, 94, 0.08)",
            color: "#22c55e",
            fontSize: 13,
            fontWeight: 600,
          }}>
            Conta detectada: {sessionUser?.username}
          </div>
        )}
      </div>

      {/* Cards de Planos */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 20,
        width: "100%",
        maxWidth: 700,
        marginBottom: 40,
        animation: "fadeIn 0.8s ease-out",
      }}>
        {PLANOS.map((plano) => (
          <div
            key={plano.key}
            className={`plan-card${selectedPlan === plano.key ? " selected" : ""}`}
            onClick={() => setSelectedPlan(plano.key)}
            style={{
              background: plano.highlight
                ? "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(14, 165, 233, 0.04))"
                : "var(--card)",
              border: `1.5px solid ${selectedPlan === plano.key ? "var(--accent)" : "var(--card-border)"}`,
              borderRadius: 20,
              padding: 28,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Badge */}
            {plano.badge && (
              <div style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: plano.highlight
                  ? "linear-gradient(135deg, var(--accent), #0284c7)"
                  : "rgba(14, 165, 233, 0.15)",
                color: plano.highlight ? "white" : "var(--accent)",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 100,
                letterSpacing: "0.3px",
              }}>
                {plano.badge}
              </div>
            )}

            {/* Seleção visual */}
            <div style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: `2px solid ${selectedPlan === plano.key ? "var(--accent)" : "var(--card-border)"}`,
              background: selectedPlan === plano.key ? "var(--accent)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              transition: "all 0.2s ease",
            }}>
              {selectedPlan === plano.key && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>

            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>
              {plano.label}
            </h2>

            <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "12px 0 20px" }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: "var(--accent)" }}>
                {plano.price}
              </span>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>{plano.period}</span>
            </div>

            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {plano.features.map((feat) => (
                <li key={feat} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)" }}>
                  <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span>
                  {feat}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Formulário de cadastro */}
      <div style={{
        width: "100%",
        maxWidth: 480,
        background: "var(--card)",
        border: "1.5px solid var(--card-border)",
        borderRadius: 20,
        padding: 32,
        animation: "fadeIn 1s ease-out",
      }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
          {isExistingUser ? "Renovar acesso" : "Criar sua conta"}
        </h3>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--muted)" }}>
          {isExistingUser
            ? "Você já está autenticado. Escolha o plano desejado e siga para o pagamento."
            : "Seu email será usado para acessar a plataforma após o pagamento."}
        </p>

        {isExistingUser ? (
          <div style={{
            display: "grid",
            gap: 12,
            padding: 16,
            borderRadius: 14,
            border: "1px solid rgba(14, 165, 233, 0.15)",
            background: "rgba(14, 165, 233, 0.04)",
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
              {sessionUser?.email ?? sessionUser?.username}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Seu usuário já está cadastrado. Não será criado outro registro; o checkout seguirá como renovação de plano.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                style={{
                  border: "1.5px solid var(--card-border)",
                  background: "var(--bg)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 15,
                  color: "var(--text)",
                  fontFamily: "inherit",
                  transition: "all 0.3s ease",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Senha
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                style={{
                  border: "1.5px solid var(--card-border)",
                  background: "var(--bg)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 15,
                  color: "var(--text)",
                  fontFamily: "inherit",
                  transition: "all 0.3s ease",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Confirmar Senha
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                style={{
                  border: "1.5px solid var(--card-border)",
                  background: "var(--bg)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 15,
                  color: "var(--text)",
                  fontFamily: "inherit",
                  transition: "all 0.3s ease",
                }}
              />
            </label>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 16,
            padding: "12px 14px",
            background: "rgba(185, 28, 28, 0.1)",
            border: "1px solid rgba(185, 28, 28, 0.3)",
            borderRadius: 10,
            color: "var(--error)",
            fontSize: 13,
            fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading || sessionLoading || !selectedPlan}
          style={{
            width: "100%",
            marginTop: 20,
            border: "none",
            borderRadius: 14,
            padding: "15px 16px",
            background: loading || sessionLoading || !selectedPlan
              ? "rgba(14, 165, 233, 0.3)"
              : "linear-gradient(135deg, var(--accent), #0284c7)",
            color: "white",
            cursor: loading || sessionLoading || !selectedPlan ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 16,
            transition: "all 0.3s ease",
            letterSpacing: "0.3px",
          }}
        >
          {sessionLoading
            ? "Verificando sessão..."
            : loading
            ? "Aguarde..."
            : selectedPlan
            ? isExistingUser
              ? `Renovar via PIX — ${PLANOS.find((p) => p.key === selectedPlan)?.price}`
              : `Pagar via PIX — ${PLANOS.find((p) => p.key === selectedPlan)?.price}`
            : "Selecione um plano acima"}
        </button>

        <div style={{
          marginTop: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          flexWrap: "wrap",
        }}>
          {["🔒 Pagamento Seguro", "⚡ PIX Instantâneo", "✅ Mercado Pago"].map((badge) => (
            <span key={badge} style={{ fontSize: 12, color: "var(--muted)" }}>{badge}</span>
          ))}
        </div>

        <div style={{ marginTop: 20, textAlign: "center", borderTop: "1px solid var(--card-border)", paddingTop: 16 }}>
          {isExistingUser ? (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Conta autenticada. Use o botão acima para renovar o acesso.
            </span>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Já tem uma conta?{" "}
              </span>
              <a
                href="/login"
                style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
              >
                Fazer login
              </a>
            </>
          )}
        </div>
      </div>

      {/* Garantia */}
      <div style={{
        marginTop: 32,
        padding: "16px 24px",
        background: "rgba(34, 197, 94, 0.05)",
        border: "1px solid rgba(34, 197, 94, 0.15)",
        borderRadius: 14,
        maxWidth: 480,
        width: "100%",
        textAlign: "center",
        animation: "fadeIn 1.2s ease-out",
      }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>🛡️ Pagamento 100% seguro</strong> via Mercado Pago.
          Após a confirmação do PIX, seu acesso é liberado automaticamente. Em caso de dúvidas, entre em contato pelo Telegram.
        </p>
      </div>
    </main>
  );
}
