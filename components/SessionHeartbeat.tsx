"use client";

import { useEffect } from "react";

export default function SessionHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const ping = async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!me.ok) {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          return;
        }

        if (cancelled) {
          return;
        }

        await fetch("/api/auth/ping", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
      } catch {
        // Silencioso: o heartbeat nao pode quebrar a UI.
      }
    };

    ping();
    timer = setInterval(ping, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void ping();
      }
    };

    window.addEventListener("focus", ping);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
      window.removeEventListener("focus", ping);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
