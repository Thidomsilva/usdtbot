import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Suspense fallback={<p style={{ color: "var(--muted)" }}>Carregando login...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
