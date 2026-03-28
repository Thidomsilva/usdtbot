import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "USDT Tracker — Preço em Tempo Real",
  description:
    "Monitoramento do preço do USDT nas principais corretoras: Binance, Bybit, Novadax, KuCoin, Kraken, MEXC e Mercado Bitcoin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
