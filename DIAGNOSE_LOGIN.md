# 🔧 Guia de Diagnóstico e Solução de Login

## ⚠️ Problema Identificado

O login está falhando no Vercel. As possíveis causas são:

1. **SESSION_SECRET diferente** - Se redeploy alterar SESSION_SECRET, tokens antigos ficam inválidos
2. **Dados de usuários perdidos** - No Vercel, `/tmp` é limpo entre deploys
3. **Redis/KV não configurado** - Sem backend de storage persistente, usuários são criados do zero

## ✅ Como Diagnosticar

### 1. Verificar Configuração (sem expor dados sensíveis)

Acesse: `https://seu-dominio.vercel.app/api/health/debug`

Procure por:
```json
{
  "storage_detection": {
    "will_use_kv_rest": true,  // ✓ Bom
    "will_use_redis_url": true, // ✓ Bom
    "will_use_file": false      // ✗ Ruim em Vercel
  },
  "users": {
    "status": "OK",
    "count": 3,
    "usernames": ["thiago@sagacy.com.br", "cliente1", "cliente2"]
  }
}
```

**Se `will_use_file` for `true` no Vercel:** Este é o problema! Os dados são perdidos entre deploys.

### 2. Variáveis de Ambiente Obrigatórias no Vercel

Você PRECISA definir UMA das opções:

#### Opção A: Usar Redis do Vercel (RECOMENDADO)
1. Vá para Project Settings → Storage → Create Database → Redis
2. Crie uma database Redis (Upstash)
3. As variáveis são adicionadas automaticamente:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

#### Opção B: Usar Redis URL customizado
Se já tiver um Redis, adicione:
- `REDIS_URL` ou `KV_URL`: `redis://usuario:senha@host:porta`

#### Opção C: File Storage (ARRISCADO)
Se usar isso em Vercel, saiba que os dados são perdidos em cada deploy.

### 3. Resolver o Problema de Login

Se não conseguir fazer login com `thiago@sagacy.com.br` / `Rafa2903@`:

1. **Confirme as credenciais no .env.local:**
   ```bash
   grep ADMIN_ .env.local
   # ADMIN_EMAIL="thiago@sagacy.com.br"
   # ADMIN_PASSWORD=Rafa2903@
   ```

2. **No Vercel, verifique as Environment Variables:**
   - Settings → Environment Variables
   - Procure: `ADMIN_EMAIL` e `ADMIN_PASSWORD`
   - Se diferentes do local, o login falhará

3. **Se SESSION_SECRET mudou:**
   - O cookie de sessão anterior fica inválido
   - Faça login novamente (a sessão anterior será descartada)

## 🚀 Passos para Corrigir

### Se usar Vercel KV/Redis:

1. **No Vercel:**
   - Project Settings → Storage → Create Database → Redis
   - Aguarde criação (2-5 minutos)
   - Redeploy automático com variáveis novas

2. **Localmente:**
   ```bash
   npm run build
   npm run start
   # Teste login local
   ```

3. **Faça um novo deploy:**
   ```bash
   git add .
   git commit -m "Fix: Add auto-sync for Redis deployment"
   git push origin main
   ```

### Se preferir manter File Storage:

⚠️ **Não recomendado em Vercel, mas se insistir:**

1. Configure `vercel.json` (já feito)
2. Certifique-se que `data/users.json` existe no repositório:
   ```bash
   git add data/users.json
   git commit -m "Add persistent user data"
   git push
   ```

## 📝 Checklist Final

- [ ] `ADMIN_EMAIL` definido no Vercel
- [ ] `ADMIN_PASSWORD` definido no Vercel
- [ ] `SESSION_SECRET` definido e consistente
- [ ] Redis/KV configurado OU `data/users.json` no git
- [ ] Redeploy realizado após mudanças
- [ ] Acessei `/api/health/debug` e verifiquei storage
- [ ] Tentei fazer login com credenciais corretas

## 🔗 Ligações Úteis

- [Vercel Storage (KV/Redis)](https://vercel.com/docs/storage/vercel-kv)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

---

**Última atualização:** 2026-05-08
