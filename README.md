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
ADMIN_EMAIL="thiago@sagacy.com.br"
ADMIN_PASSWORD="DefinaUmaSenhaForteAqui"
SESSION_SECRET="opcional-mas-recomendado-em-producao"
```

2. Inicie o projeto e entre em `/login` com o admin.
3. Abra `/admin` para incluir, travar, reativar e excluir usuarios sem sair do sistema.

Observacoes:
- Em producao na Vercel, conecte um Redis da Marketplace (Upstash) para persistencia real.
- Com `KV_REST_API_URL` + `KV_REST_API_TOKEN` ou `KV_REST_API_REDIS_URL`, os usuarios passam a ser salvos no Redis.
- Sem KV configurado, o projeto usa fallback local em `data/users.json` (bom para desenvolvimento).
- Se `SESSION_SECRET` nao estiver configurada, a aplicacao usa `ADMIN_EMAIL` + `ADMIN_PASSWORD` para assinar a sessao.
- Em producao, prefira definir `SESSION_SECRET` explicitamente para desacoplar a sessao da senha do admin.

## Persistencia no Vercel (recomendado)

1. No projeto da Vercel, acesse `Storage` e conecte um Redis (Upstash) pela Marketplace.
2. Confirme que pelo menos uma destas opcoes de env foi adicionada no projeto:
	- `KV_REST_API_URL` + `KV_REST_API_TOKEN`
	- `KV_REST_API_REDIS_URL`
3. Mantenha tambem `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET` nas env vars.
4. Faça um novo deploy.

Com isso, um usuario criado pelo admin continua funcionando ate ser travado ou excluido no `/admin`.

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