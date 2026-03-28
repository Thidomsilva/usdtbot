# usdtbot

Monitoramento de USDT/BRL com dashboard web e API.

## Estrutura

- Projeto principal: `usdt-tracker/`
- Frontend Next.js: `usdt-tracker/frontend`
- API FastAPI: `usdt-tracker/api/index.py`

## Rodar localmente

Backend:

```bash
cd usdt-tracker
pip install -r api/requirements.txt
bash run_api.sh
```

Frontend:

```bash
cd usdt-tracker/frontend
npm install
npm run dev
```

## Deploy (Vercel)

- O repositório possui `vercel.json` na raiz para build em monorepo.
- Se o projeto na Vercel estiver com Root Directory customizado, mantenha `usdt-tracker`.