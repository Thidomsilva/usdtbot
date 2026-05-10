import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main 
      style={{ 
        minHeight: "100vh", 
        display: "grid", 
        placeItems: "center", 
        padding: 24,
        background: "linear-gradient(135deg, var(--bg-grad-1) 0%, var(--bg) 50%, var(--bg-grad-2) 100%)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Elementos decorativos de fundo */}
      <div style={{
        position: "absolute",
        top: -50,
        right: -50,
        width: 400,
        height: 400,
        background: "radial-gradient(circle, rgba(14, 165, 233, 0.1) 0%, transparent 70%)",
        borderRadius: "50%",
        pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute",
        bottom: -100,
        left: -100,
        width: 500,
        height: 500,
        background: "radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)",
        borderRadius: "50%",
        pointerEvents: "none"
      }} />
      
      <Suspense fallback={<p style={{ color: "var(--muted)", position: "relative", zIndex: 1 }}>Carregando login...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
