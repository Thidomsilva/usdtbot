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
- Em producao na Vercel, conecte Supabase ou Redis da Marketplace (Upstash) para persistencia real.
- Com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, os usuarios passam a ser salvos no Supabase (backend prioritario).
- Com `KV_REST_API_URL` + `KV_REST_API_TOKEN` ou `KV_REST_API_REDIS_URL`, os usuarios passam a ser salvos no Redis.
- Sem backend persistente configurado, o projeto usa fallback local em `data/users.json` (somente desenvolvimento).
- Em deploy na Vercel, o sistema falha de forma explicita se nao houver Supabase/Redis/KV configurado. Isso evita falsa sensacao de persistencia com storage efemero.
- Se `SESSION_SECRET` nao estiver configurada, a aplicacao usa `ADMIN_EMAIL` + `ADMIN_PASSWORD` para assinar a sessao.
- Em producao, prefira definir `SESSION_SECRET` explicitamente para desacoplar a sessao da senha do admin.

## Persistencia no Vercel (recomendado)

Opcao A (recomendada): Supabase

1. Crie um projeto no Supabase.
2. Execute este SQL no `SQL Editor`:

```sql
create table if not exists public.app_storage (
	key text primary key,
	value jsonb not null,
	updated_at timestamptz not null default now()
);
```

3. Configure no projeto da Vercel:
	 - `SUPABASE_URL`
	 - `SUPABASE_SERVICE_ROLE_KEY`
	 - `SUPABASE_STORAGE_TABLE` (opcional, default: `app_storage`)
4. Mantenha tambem `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET` nas env vars.
5. Faça um novo deploy.

Opcao B: Redis/KV

1. No projeto da Vercel, acesse `Storage` e conecte um Redis (Upstash) pela Marketplace.
2. Confirme que pelo menos uma destas opcoes de env foi adicionada no projeto:
	- `KV_REST_API_URL` + `KV_REST_API_TOKEN`
	- `KV_REST_API_REDIS_URL`
3. Mantenha tambem `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `SESSION_SECRET` nas env vars.
4. Faça um novo deploy.

Com isso, um usuario criado pelo admin continua funcionando ate ser travado ou excluido no `/admin`.

## Restaurar usuarios a partir de backup JSON

Se voce tem um backup JSON exportado antes da perda, este e o caminho correto:

1. Configure Supabase ou Redis/KV no projeto da Vercel primeiro.
2. Faça um novo deploy com `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` e as variaveis do backend persistente.
3. Entre como admin em `/login`.
4. Abra `/admin`.
5. Use o botao `Restaurar backup` e selecione o JSON exportado.

Importante:
- Nao use `AUTH_USERS` com valores de exemplo em producao.
- O arquivo `data/users.json` esta ignorado pelo git e nao deve ser tratado como banco de dados de producao.
- Se o deploy estiver sem Supabase/Redis/KV, login/admin devem ser considerados indisponiveis ate a configuracao correta.

## Endpoints

- `GET /api/health`
- `GET /api/prices`
- `GET /api/fan-tokens`
- `GET /api/p2p-arbitrage`

## Telegram

O bot trabalha com tres solucoes:

- `/cadastro usuario senha` cria um usuario comum e vincula o chat atual
- `/login usuario senha` autentica um usuario existente e libera o chat atual
- `/logout` remove o vinculo do chat atual
- `A) /usdt` USDT entre CEXs (compra e venda entre corretoras)
- `B) /scanner` scanner completo de moedas
- `C) /usdt_defi` compra em CEX e venda no DeFiLlama (BRLA)
- `/start` abre o menu com as tres opcoes
- `/settings` abre as configuracoes do usuario no Telegram

Fluxo de acesso do bot:

- No primeiro contato, o chat precisa executar `/cadastro usuario senha` ou `/login usuario senha`
- O vinculo do chat com o usuario fica salvo no storage persistente do sistema
- Apenas chats autenticados e usuarios ativos recebem menu, sinais e monitoramento automatico

Configuracao por usuario (Telegram):

- `Envio automatico de sinais`: `A) USDT entre CEXs`, `B) Scanner`, `C) USDT -> DeFi`, `Todas as 3` ou `Desligado`
- No modo `C`, a venda no DeFi considera taxa estimada total de 0.50% (swap + slippage)

Envio automatico:

- O projeto possui um despachante em `GET /api/telegram/dispatch`
- Neste repositorio, o cron da Vercel foi desativado para evitar envio duplicado
- O envio automatico deve ser feito por cron externo (no seu servidor ja existente)
- Para proteger o endpoint, defina `CRON_SECRET` na Vercel (o cron envia `Authorization: Bearer <CRON_SECRET>`)

### Configuracao recomendada com dominio atual

Dominio de producao:

- `https://usdtbot.vercel.app`

Webhook do Telegram:

```bash
curl -X POST "https://api.telegram.org/botSEU_TOKEN/setWebhook" \
	-H "Content-Type: application/json" \
	-d '{
		"url": "https://usdtbot.vercel.app/api/telegram",
		"secret_token": "SEU_TELEGRAM_WEBHOOK_SECRET"
	}'
```

Teste manual de dispatch:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" \
	"https://usdtbot.vercel.app/api/telegram/dispatch?source=manual"
```

Cron externo (servidor compartilhado):

1. Exporte `CRON_SECRET` no servidor.
2. Adicione no crontab:

```bash
* * * * * /caminho/do/projeto/scripts/cron-telegram-dispatch.sh
```

### Variaveis de ambiente

Configure no deploy ou no `.env.local`:

```bash
TELEGRAM_BOT_TOKEN="seu_token_do_bot"
TELEGRAM_WEBHOOK_SECRET="um_segredo_longo"
TELEGRAM_CHAT_ID="5214189267"
```

Aliases aceitos para compatibilidade:

- Token: `TELEGRAM_TOKEN` ou `BOT_TOKEN`
- Webhook secret: `TELEGRAM_SECRET` ou `WEBHOOK_SECRET`

Se quiser restringir para mais de um chat, use `TELEGRAM_ALLOWED_CHAT_IDS` com uma lista separada por virgulas.

### Webhook

1. Publique o app em HTTPS.
2. Configure o webhook do bot para `https://seu-dominio/api/telegram`.
3. Envie o header `x-telegram-bot-api-secret-token` com o valor de `TELEGRAM_WEBHOOK_SECRET`.

Depois disso, mande `/usdt` ou `/scanner` para o bot e ele responde no mesmo chat.

## Paginas

- `/` monitor USDT/BRL
- `/fan-tokens` monitor de fan tokens
- `/p2p` monitor de arbitragem P2P (USDT/BRL)
- `/login` autenticacao do sistema
- `/admin` inclusao/exclusao de usuarios

## Mercado Pago

Para os fluxos de pagamento, configure no ambiente local ou no painel da Vercel:

```bash
MERCADOPAGO_ACCESS_TOKEN="seu_access_token"
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY="sua_public_key"
NEXT_PUBLIC_APP_URL="https://seu-dominio"
```

Observacoes:

- No desenvolvimento local, use `.env.local` na raiz do projeto.
- Depois de alterar variaveis de ambiente, reinicie o servidor Next.js.
- Em producao na Vercel, as variaveis precisam ser cadastradas no painel do projeto; `.env.local` nao vai para o deploy.