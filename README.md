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

## Controle de acesso (usuario/senha)

O projeto agora usa login interno com sessao por cookie assinado.

Administrador atual: thiago@sagacy.com.br

1. Configure as variaveis abaixo no `.env.local` (ou na Vercel):

```bash
SESSION_SECRET="troque-por-um-segredo-longo-e-aleatorio"
ADMIN_EMAIL="thiago@sagacy.com.br"
ADMIN_PASSWORD="DefinaUmaSenhaForteAqui"
```

2. Inicie o projeto e entre em `/login` com o admin.
3. Abra `/admin` para incluir e excluir usuarios sem sair do sistema.

Observacoes:
- Os usuarios sao persistidos em `data/users.json` com senha hasheada.
- Em plataformas sem disco persistente, use um storage externo (exemplo: banco de dados/KV).
- Se `SESSION_SECRET` nao estiver configurada, a aplicacao responde `503` por seguranca.

## Endpoints

- `GET /api/health`
- `GET /api/prices`
- `GET /api/fan-tokens`
- `GET /api/p2p-arbitrage`

## Paginas

- `/` monitor USDT/BRL
- `/fan-tokens` monitor de fan tokens
- `/p2p` monitor de arbitragem P2P (USDT/BRL)
- `/login` autenticacao do sistema
- `/admin` inclusao/exclusao de usuarios