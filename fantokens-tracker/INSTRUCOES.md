# Fan Tokens Tracker — Instruções de Integração

## O que está nesta pasta

| Arquivo                    | Onde colar no projeto               | O que faz                              |
|---------------------------|-------------------------------------|----------------------------------------|
| `fan-tokens-page.tsx`     | `frontend/src/app/fan-tokens/page.tsx` | Página completa do dashboard de fan tokens |
| `fan-tokens-api-route.py` | Colar no final de `api/index.py`    | Endpoint `/api/fantokens` no backend   |
| `useFanTokens.ts`         | `frontend/src/lib/useFanTokens.ts`  | Hook React (só necessário se for refatorar o page) |

---

## Passo a passo

### 1. Criar a rota da página no Next.js

```bash
mkdir -p frontend/src/app/fan-tokens
```

Cole o conteúdo de `fan-tokens-page.tsx` em:
```
frontend/src/app/fan-tokens/page.tsx
```

A página vai estar disponível em: `https://seu-app.vercel.app/fan-tokens`

---

### 2. Adicionar o endpoint ao backend

Abra `api/index.py` e cole **todo o conteúdo** de `fan-tokens-api-route.py`
logo antes do bloco `if __name__ == "__main__":` (ou no final do arquivo).

Certifique-se que os imports já existem no topo do `index.py`:
```python
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional
```
Se não tiver `Optional`, adicione na linha de imports do typing.

---

### 3. Adicionar link de navegação entre páginas (opcional)

No `frontend/src/app/page.tsx` (página do USDT tracker), adicione no header:

```tsx
import Link from "next/link";

// dentro do JSX do header:
<Link href="/fan-tokens" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none", fontWeight: 500 }}>
  🏆 Fan Tokens →
</Link>
```

E no `frontend/src/app/fan-tokens/page.tsx`, adicione o botão de volta:

```tsx
import Link from "next/link";

// no topo da página:
<Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
  ← USDT Tracker
</Link>
```

---

## Como funciona a lógica de arbitragem

```
CoinGecko API (preço base gratuito)
         ↓
Backend consulta cada corretora individualmente:
  Binance  → SYMBOLUSDT
  Gate.io  → SYMBOL_USDT
  Bybit    → SYMBOLUSDT
  MB       → SYMBOL (BRL → USD)
  Novadax  → SYMBOL_BRL (BRL → USD)
         ↓
Calcula spread entre todas as combinações buy/sell
         ↓
Retorna melhor oportunidade por token
```

### Fórmula do spread
```
spread_pct = (preço_venda - preço_compra) / preço_compra × 100
lucro_100  = (100 / preço_compra) × (preço_venda - preço_compra)
```

---

## Atenção: tokens não listados em todas as corretoras

Fan tokens Tier 3 e 4 (ex: Flamengo, Corinthians) muitas vezes só estão
em 1–2 corretoras. Nesses casos:
- O backend retorna `status: "error"` para as corretoras onde o token não está listado
- O card mostra "não listado" para essas corretoras
- A oportunidade de arbitragem só aparece se houver ≥ 2 corretoras com preço

---

## Deploy

Após colar os arquivos, basta fazer deploy normalmente:
```bash
vercel --prod
```

O `vercel.json` já roteia `/api/*` para o Python automaticamente.
