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

O bot responde a dois comandos:

- `/start` abre um menu com os dois botões
- `/usdt` envia o melhor sinal do monitor USDT/BRL
- `/scanner` envia o melhor sinal do scanner completo de moedas
- `/settings` abre as configuracoes do usuario no Telegram

Configuracao por usuario (Telegram):

- `Incluir DeFi (BRLA) no monitoramento`: desativado por padrao
- Quando ativado, o ranking de venda do `UsdtBot` inclui `🔗 DeFi BRLA` com desconto estimado de 0.50%
- `Envio automatico de sinais`: `UsdtBot`, `Scanner Bot`, `Ambos` ou `Desligado`

Envio automatico:

- O projeto possui um despachante em `GET /api/telegram/dispatch`
- Na Vercel, o `vercel.json` agenda cron a cada 1 minuto para enviar sinais novos automaticamente
- Para proteger o endpoint, defina `CRON_SECRET` na Vercel (o cron envia `Authorization: Bearer <CRON_SECRET>`)

### Variaveis de ambiente

Configure no deploy ou no `.env.local`:

```bash
TELEGRAM_BOT_TOKEN="seu_token_do_bot"
TELEGRAM_WEBHOOK_SECRET="um_segredo_longo"
TELEGRAM_CHAT_ID="5214189267"
```

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