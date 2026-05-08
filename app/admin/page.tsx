"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  username: string;
  role: "admin" | "user";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function AdminPage() {
  const telegramHref = "tg://resolve?phone=5543999027395&text=Ol%C3%A1%20da%20ferramenta%20USDBot%20e%20gostaria%20de%20liberar%20meu%20acesso%20full";
  const telegramQrSrc = "/telegram-qr-oficial.jpeg";
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [submitting, setSubmitting] = useState(false);
  const [updatingUsername, setUpdatingUsername] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  async function loadUsers() {
    setLoadingUsers(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.error || "Falha ao carregar usuarios");
        return;
      }

      setUsers(payload.users || []);
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      const payload = await me.json().catch(() => ({}));

      const isAdmin = Boolean(me.ok && payload?.user?.role === "admin");
      setCanManage(isAdmin);
      setCheckingAuth(false);

      if (isAdmin) {
        loadUsers();
      }
    })();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Falha ao criar usuario");
        return;
      }

      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await loadUsers();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(username: string) {
    const confirmed = window.confirm(`Remover o usuario ${username}?`);
    if (!confirmed) {
      return;
    }

    setError(null);

    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload?.error || "Falha ao remover usuario");
      return;
    }

    await loadUsers();
  }

  async function handleToggleActive(user: User) {
    const shouldActivate = !user.active;
    const actionLabel = shouldActivate ? "reativar" : "travar";
    const confirmed = window.confirm(`Deseja ${actionLabel} o usuario ${user.username}?`);
    if (!confirmed) {
      return;
    }

    setUpdatingUsername(user.username);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, active: shouldActivate }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Falha ao atualizar status do usuario");
        return;
      }

      await loadUsers();
    } finally {
      setUpdatingUsername(null);
    }
  }

  async function handleExportBackup() {
    setError(null);

    const response = await fetch("/api/admin/users/backup", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload?.error || "Falha ao exportar backup");
      return;
    }

    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usdtbot-users-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setRestoring(true);
    setError(null);

    try {
      const raw = await file.text();
      const backup = JSON.parse(raw);

      const response = await fetch("/api/admin/users/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || "Falha ao restaurar backup");
        return;
      }

      await loadUsers();
    } catch {
      setError("Arquivo de backup invalido");
    } finally {
      event.target.value = "";
      setRestoring(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (checkingAuth) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <p style={{ color: "var(--muted)" }}>Validando permissao...</p>
      </main>
    );
  }

  if (!canManage) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ maxWidth: 640, width: "100%", background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 20, padding: 28, textAlign: "center", boxShadow: "var(--shadow)" }}>
          <h1 style={{ marginTop: 0, marginBottom: 12 }}>Acesso bloqueado</h1>
          <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, margin: "0 auto", maxWidth: 420 }}>
            Para acesso full da ferramenta falar com o Thiago:
          </p>
          <a
            href={telegramHref}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 18, textDecoration: "none", color: "var(--text)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 16px", background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))", fontWeight: 700 }}
          >
            Telegram: 43 99902-7395
          </a>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>
            A mensagem ja sera aberta como: Ola da ferramenta USDBot e gostaria de liberar meu acesso full
          </p>
          <div style={{ marginTop: 12, display: "grid", placeItems: "center", gap: 8 }}>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
              Se estiver no notebook, escaneie o QR Code para abrir no Telegram.
            </p>
            <img
              src={telegramQrSrc}
              alt="QR Code para contato no Telegram"
              width={150}
              height={150}
              style={{ borderRadius: 12, border: "1px solid var(--card-border)", background: "#fff", padding: 8 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--text)", border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 12px" }}>Voltar</Link>
            <button onClick={logout} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 12px", background: "var(--card)", color: "var(--text)", cursor: "pointer" }}>Sair</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0 }}>Administracao de acessos</h1>
            <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 14 }}>
              Inclua, trave, reative ou exclua usuarios sem sair do sistema.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/" style={{ textDecoration: "none", color: "var(--text)", border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "var(--card)" }}>
              Voltar ao monitor
            </Link>
            <button onClick={logout} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "var(--card)", color: "var(--text)", cursor: "pointer" }}>
              Sair
            </button>
          </div>
        </header>

        <section style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 16, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Novo usuario</h2>
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 10 }}>
            <input
              placeholder="usuario@dominio.com"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.7)", color: "var(--text)" }}
            />
            <input
              type="password"
              placeholder="Senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.7)", color: "var(--text)" }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value === "admin" ? "admin" : "user")}
              style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "var(--card)", color: "var(--text)" }}
            >
              <option value="user">Perfil: usuario</option>
              <option value="admin">Perfil: admin</option>
            </select>
            <button
              type="submit"
              disabled={submitting}
              style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "10px 12px", background: "linear-gradient(135deg, var(--card), rgba(255,255,255,0.12))", color: "var(--text)", cursor: "pointer", fontWeight: 700 }}
            >
              {submitting ? "Salvando..." : "Criar usuario"}
            </button>
          </form>
        </section>

        <section style={{ marginTop: 16, background: "var(--card)", border: "1px solid var(--card-border)", borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Usuarios cadastrados</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {users.length > 0 && (
                <button
                  onClick={handleExportBackup}
                  style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 14px", background: "var(--card)", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
                >
                  Exportar backup (JSON)
                </button>
              )}
              <label style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: "8px 14px", background: "var(--card)", color: "var(--text)", cursor: restoring ? "wait" : "pointer", fontSize: 13, opacity: restoring ? 0.7 : 1 }}>
                {restoring ? "Restaurando..." : "Restaurar backup"}
                <input type="file" accept="application/json" onChange={handleImportBackup} disabled={restoring} style={{ display: "none" }} />
              </label>
            </div>
          </div>
          {error && <p style={{ color: "var(--error)", fontSize: 13, marginTop: 12 }}>{error}</p>}
          {loadingUsers ? (
            <p style={{ color: "var(--muted)" }}>Carregando...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--card-border)" }}>
                    <th style={{ padding: "10px 8px" }}>Usuario</th>
                    <th style={{ padding: "10px 8px" }}>Perfil</th>
                    <th style={{ padding: "10px 8px" }}>Status</th>
                    <th style={{ padding: "10px 8px" }}>Criado em</th>
                    <th style={{ padding: "10px 8px" }}>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr key={user.username} style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "10px 8px" }}>{user.username}</td>
                      <td style={{ padding: "10px 8px" }}>{user.role}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <span
                          style={{
                            border: "1px solid var(--card-border)",
                            borderRadius: 999,
                            padding: "4px 10px",
                            fontSize: 12,
                            fontWeight: 700,
                            color: user.active ? "#0b8f57" : "#a63c3c",
                            background: user.active ? "rgba(24, 201, 122, 0.12)" : "rgba(246, 88, 88, 0.14)",
                          }}
                        >
                          {user.active ? "ativo" : "travado"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 8px" }}>{new Date(user.createdAt).toLocaleString("pt-BR")}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={updatingUsername === user.username}
                            style={{ border: "1px solid var(--card-border)", borderRadius: 8, padding: "7px 10px", background: "var(--card)", color: "var(--text)", cursor: "pointer" }}
                          >
                            {user.active ? "Travar" : "Reativar"}
                          </button>
                          <button
                            onClick={() => handleDelete(user.username)}
                            disabled={updatingUsername === user.username}
                            style={{ border: "1px solid var(--card-border)", borderRadius: 8, padding: "7px 10px", background: "var(--card)", color: "var(--text)", cursor: "pointer" }}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
