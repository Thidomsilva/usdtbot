# USDT Tracker — Preço em Tempo Real (USDT/BRL)

Dashboard para monitorar o preço do USDT em BRL nas principais corretoras, com atualização automática a cada 30 segundos.

## Corretoras monitoradas

| Corretora        | Par      | Região |
|-----------------|----------|--------|
| Binance         | USDT/BRL | Brasil |
| KuCoin          | USDT/BRL | Brasil |
| Novadax         | USDT/BRL | Brasil |
| Mercado Bitcoin | USDT/BRL | Brasil |

## Funcionalidades

- ✅ Preço em tempo real de 4 corretoras
- ✅ Spread total entre corretoras (oportunidade de arbitragem)
- ✅ Variação 24h, máxima, mínima e volume
- ✅ Atualização automática a cada 30s
- ✅ Indicação da corretora com menor e maior preço

---

## Estrutura do projeto

```
usdt-tracker/
├── api/
│   ├── index.py          # Backend FastAPI — busca preços de todas as corretoras
│   └── requirements.txt  # Dependências Python
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx  # Dashboard principal
│   │   └── lib/
│   │       ├── types.ts  # Tipos TypeScript
│   │       └── usePrices.ts # Hook de polling
│   ├── package.json
│   ├── next.config.js
│   └── tsconfig.json
├── vercel.json           # Config de deploy Vercel
├── run_api.sh            # Script dev local (backend)
└── README.md
```

---

## Deploy na Vercel (produção)

URL de produção esperada: `https://usdtbot.vercel.app/`

### 1. Instale a Vercel CLI (se não tiver)
```bash
npm i -g vercel
```

### 2. Faça login
```bash
vercel login
```

### 3. Deploy direto da raiz do projeto
```bash
vercel --prod
```

Se fizer deploy via dashboard da Vercel conectado ao GitHub:
- Defina **Root Directory** como `usdt-tracker` (se o repositório tiver essa pasta na raiz)
- Build Command: `cd frontend && npm run build`
- Install Command: `cd frontend && npm ci`

A Vercel detecta automaticamente:
- `/api/index.py` → runtime Python 3.12 (serverless function)
- `/frontend` → Next.js app

Todas as rotas `/api/*` são direcionadas automaticamente ao backend Python.

---

## Desenvolvimento local

### Backend (FastAPI)
```bash
# Na raiz do projeto
pip install -r api/requirements.txt
bash run_api.sh
# → http://localhost:8000/api/prices
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

O `next.config.js` já redireciona `/api/*` para `localhost:8000` em modo dev.

---

## Endpoints da API

### `GET /api/prices`
Retorna preços de todas as corretoras com resumo.

```json
{
  "timestamp": "2025-03-28T12:00:00Z",
  "summary": {
    "min": 5.2382,
    "max": 5.2670,
    "avg": 5.2510,
    "spread_pct": 0.54982,
    "min_exchange": "Mercado Bitcoin",
    "max_exchange": "Novadax"
  },
  "exchanges": {
    "binance": {
      "status": "ok",
      "label": "Binance",
      "price_brl": 5.2501,
      "volume_24h": 183400000,
      "change_24h": 0.1200,
      "high_24h": 5.2800,
      "low_24h": 5.2100,
      "pair": "USDT/BRL"
    }
  }
}
```

### `GET /api/health`
Health check.

---

## Notas técnicas

- O backend faz todas as chamadas server-side, resolvendo os problemas de CORS que ocorrem no browser
- Timeout de 8s por corretora — corretoras com erro retornam `"status": "error"` sem derrubar as demais
- Apenas pares USDT/BRL são monitorados
- Na Vercel, cada chamada `/api/prices` é uma serverless function com `maxDuration: 15s`
