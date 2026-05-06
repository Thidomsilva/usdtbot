"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const telegramHref =
    "tg://resolve?phone=5543999027395&text=Ol%C3%A1%20da%20ferramenta%20USDBot%20e%20gostaria%20de%20liberar%20meu%20acesso%20full";
  const telegramQrSrc =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=tg%3A%2F%2Fresolve%3Fphone%3D5543999027395%26text%3DOl%25C3%25A1%2520da%2520ferramenta%2520USDBot%2520e%2520gostaria%2520de%2520liberar%2520meu%2520acesso%2520full";

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
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 420,
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "var(--shadow)",
        backdropFilter: "blur(12px)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28 }}>Acesso restrito</h1>
      <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 14 }}>
        Entre com seu usuario e senha para acessar o painel.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 18, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={{
              border: "1px solid var(--card-border)",
              background: "rgba(255,255,255,0.7)",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 14,
              color: "var(--text)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{
              border: "1px solid var(--card-border)",
              background: "rgba(255,255,255,0.7)",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 14,
              color: "var(--text)",
            }}
          />
        </label>

        {error && <p style={{ margin: 0, color: "var(--error)", fontSize: 13 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            border: "1px solid var(--card-border)",
            borderRadius: 12,
            padding: "10px 12px",
            background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))",
            color: "var(--text)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <a
        href={telegramHref}
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: 14,
          display: "inline-flex",
          width: "100%",
          justifyContent: "center",
          border: "1px solid var(--card-border)",
          borderRadius: 12,
          padding: "10px 12px",
          textDecoration: "none",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 600,
          background: "var(--card)",
        }}
      >
        para solicitar seu acesso fale com o desenvolvedor clicando aqui
      </a>

      <div style={{ marginTop: 14, display: "grid", placeItems: "center", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
          Se estiver no notebook, escaneie o QR Code para abrir no Telegram.
        </p>
        <img
          src={telegramQrSrc}
          alt="QR Code para contato no Telegram"
          width={140}
          height={140}
          style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "#fff", padding: 8 }}
        />
      </div>
    </section>
  );
}
