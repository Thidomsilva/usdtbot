"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const telegramHref =
    "tg://resolve?phone=5543999027395&text=Ol%C3%A1%20da%20ferramenta%20USDBot%20e%20gostaria%20de%20liberar%20meu%20acesso%20full";
  const telegramQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=10&data=${encodeURIComponent(telegramHref)}`;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Falha no login");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Nao foi possivel conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 480,
        position: "relative",
        zIndex: 10,
        animation: "slideUp 0.6s ease-out",
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1), 0 0 0 1.5px var(--accent);
        }
        .login-btn:hover {
          background: linear-gradient(135deg, var(--accent), #0284c7) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(14, 165, 233, 0.3);
        }
        .login-btn:active { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>

      {/* Banner de pagamento */}
      <div style={{
        marginBottom: 16,
        padding: "16px 18px",
        background: "linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(234, 179, 8, 0.06))",
        border: "1.5px solid rgba(234, 179, 8, 0.35)",
        borderRadius: 16,
        backdropFilter: "blur(10px)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>&#x26A1;</span>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#eab308" }}>
              Plataforma com Acesso Pago
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Devido à alta demanda e para garantir a estabilidade dos servidores, passamos a cobrar
              uma taxa simbólica. Plano semanal a partir de{" "}
              <strong style={{ color: "var(--text)" }}>R$ 12,99</strong> ou mensal por{" "}
              <strong style={{ color: "var(--text)" }}>R$ 34,99</strong>.
            </p>
            <a
              href="/planos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: "linear-gradient(135deg, #eab308, #ca8a04)",
                color: "white",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.3px",
              }}
            >
              Ver Planos e Assinar
            </a>
          </div>
        </div>
      </div>

      {/* Card de login */}
      <div style={{
        background: "var(--card)",
        border: "1.5px solid var(--card-border)",
        borderRadius: 24,
        padding: 40,
        boxShadow: "var(--shadow)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            background: "linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Acesso Restrito
          </h1>
          <p style={{ marginTop: 10, color: "var(--muted)", fontSize: 15, lineHeight: 1.5 }}>
            Entre com seu usuário e senha para acessar o painel de controle
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ marginTop: 28, display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{
              fontSize: 13,
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              Usuário
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              placeholder="Digite seu usuário"
              style={{
                border: "1.5px solid var(--card-border)",
                background: "var(--bg)",
                borderRadius: 14,
                padding: "13px 16px",
                fontSize: 15,
                color: "var(--text)",
                fontFamily: "inherit",
                transition: "all 0.3s ease",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{
              fontSize: 13,
              color: "var(--muted)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              Senha
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="Digite sua senha"
              style={{
                border: "1.5px solid var(--card-border)",
                background: "var(--bg)",
                borderRadius: 14,
                padding: "13px 16px",
                fontSize: 15,
                color: "var(--text)",
                fontFamily: "inherit",
                transition: "all 0.3s ease",
                WebkitAppearance: "none",
                appearance: "none",
              }}
            />
          </label>

          {error && (
            <div style={{
              margin: 0,
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
            className="login-btn"
            type="submit"
            disabled={loading}
            style={{
              border: "none",
              borderRadius: 14,
              padding: "14px 16px",
              background: loading
                ? "linear-gradient(135deg, rgba(14, 165, 233, 0.4), rgba(14, 165, 233, 0.2))"
                : "linear-gradient(135deg, var(--accent), #0284c7)",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 15,
              transition: "all 0.3s ease",
              marginTop: 8,
              letterSpacing: "0.5px",
              width: "100%",
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          <a
            href={telegramHref}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "1.5px solid var(--card-border)",
              borderRadius: 14,
              padding: "13px 16px",
              textDecoration: "none",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 600,
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          >
            <span>&#x1F4AC;</span>
            <span>Solicitar Acesso no Telegram</span>
          </a>

          <div style={{
            padding: "16px 14px",
            background: "rgba(14, 165, 233, 0.05)",
            border: "1px solid rgba(14, 165, 233, 0.1)",
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            gap: 10,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", textAlign: "center", fontWeight: 500 }}>
              Escaneie o QR Code com seu Telegram
            </p>
            <img
              src={telegramQrSrc}
              alt="QR Code para contato no Telegram"
              width={200}
              height={200}
              style={{ borderRadius: 10, border: "2px solid var(--card-border)" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
