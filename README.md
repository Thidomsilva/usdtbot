# usdtbot

Monitoramento em tempo real do par USDT/BRL.

## Stack

- Next.js (App Router)
- API integrada em `/api/prices` e `/api/health`

## Rodar localmente

```bash
npm install
npm run dev
```

App: `http://localhost:3000`

## Deploy na Vercel

- Deploy direto da raiz do repositório
- Sem `Root Directory` customizado
- Sem configuração manual de rewrites

## Endpoints

- `GET /api/health`
- `GET /api/prices`