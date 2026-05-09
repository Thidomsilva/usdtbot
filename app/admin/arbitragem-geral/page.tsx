"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyArbitragemGeralPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/arbitragem-scanner");
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <p style={{ color: "var(--muted)" }}>Redirecionando para o Scanner de Arbitragem...</p>
    </main>
  );
}
