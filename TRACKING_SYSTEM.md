# 📊 Sistema de Tracking de Acessos e Atividades

## Resumo

Implementado um sistema completo de tracking de acessos e atividades do sistema. Como admin/dono, você agora pode:

✅ **Visualizar quem está acessando o sistema**
✅ **Ver o que cada pessoa está acessando**
✅ **Rastrear padrões de uso e recorrência de utilização**
✅ **Monitorar sessões com timeout de 3 horas de inatividade**
✅ **Acompanhar logins e logouts**

---

## 🔐 Características de Segurança

### Timeout de Sessão - 3 Horas
- Tokens JWT agora expiram após **3 horas de inatividade**
- Quando um usuário tenta acessar após expiração, precisa fazer login novamente
- Isso permite rastrear a recorrência de utilização com precisão

### Restrição de Acesso a Dados de Admin
- Apenas usuários com role `admin` podem acessar o dashboard de acessos
- APIs de tracking (`/api/admin/*`) são protegidas por validação de admin
- Tentativas não autorizadas retornam erro 403

---

## 📈 Dashboard de Acessos

Acesse em **`/admin/access-logs`** para ver:

### 1. **Cartões de Estatísticas Gerais**
- 👥 **Usuários Online**: Quantos usuários estão conectados agora
- 📊 **Logins**: Total de logins nos últimos X dias
- 📈 **Total de Acessos**: Número total de interações
- ⭐ **Usuários Ativos**: Quantos usuários diferentes foram ativos

### 2. **Top Páginas Acessadas**
- Lista as páginas/rotas mais visitadas
- Mostra o número de acessos para cada página
- Útil para entender quais funcionalidades são mais usadas

### 3. **Top Usuários**
- Mostra quais usuários mais acessam o sistema
- Número de acessos total por usuário
- Identifica power users

### 4. **Usuários Online Agora**
- Lista real-time dos usuários conectados
- Mostra:
  - Nome do usuário
  - Perfil (Admin/User)
  - Horário de login
  - Último acesso
  - Duração da sessão atual

### 5. **Histórico de Acessos Detalhado**
- Tabela com todos os acessos registrados
- Colunas:
  - **Usuário**: Quem fez a ação
  - **Tipo**: Login, Logout, Acesso a Página, Chamada de API
  - **Caminho**: Qual página/API foi acessada
  - **Horário**: Quando ocorreu
- **Filtros**:
  - Filtrar por usuário
  - Filtrar por período (24h, 7 dias, 30 dias)

---

## 📡 APIs de Admin

### 1. `GET /api/admin/access-logs`
Retorna histórico de acessos (últimos 500 por padrão)

**Query Parameters:**
- `limit` (opcional): Número máximo de logs (default: 500)
- `username` (opcional): Filtrar logs de um usuário específico

**Resposta:**
```json
{
  "logs": [
    {
      "id": "timestamp-random",
      "username": "user@example.com",
      "userRole": "admin",
      "activityType": "login",
      "path": "/api/auth/login",
      "method": "POST",
      "timestamp": "2026-05-28T10:30:00.000Z"
    }
  ]
}
```

### 2. `GET /api/admin/user-sessions`
Retorna informações de todas as sessões de usuários

**Resposta:**
```json
{
  "sessions": [
    {
      "username": "user@example.com",
      "role": "user",
      "loginAt": "2026-05-28T10:00:00.000Z",
      "lastActivityAt": "2026-05-28T12:30:00.000Z",
      "logoutAt": "2026-05-28T13:00:00.000Z",
      "isActive": false,
      "sessionDuration": "3h 0m 0s"
    }
  ]
}
```

### 3. `GET /api/admin/statistics`
Retorna estatísticas agregadas

**Query Parameters:**
- `days` (opcional): Número de dias para agregar estatísticas (default: 7)

**Resposta:**
```json
{
  "stats": {
    "totalLogins": 45,
    "totalAccess": 234,
    "activeUsers": 5,
    "accessByPage": {
      "/dashboard": 50,
      "/settings": 30
    },
    "topPages": [
      { "page": "/dashboard", "count": 50 }
    ],
    "topUsers": [
      { "username": "user@example.com", "count": 100 }
    ]
  }
}
```

---

## 💾 Armazenamento de Dados

### Arquivos de Log

Os dados são armazenados em dois arquivos JSON:

#### `data/activity-logs.json`
Contém todos os registros de atividades:
- Logins
- Logouts
- Acessos a páginas
- Chamadas de API

**Limite**: Mantém apenas os últimos 10.000 registros para evitar crescimento excessivo

#### `data/user-sessions.json`
Contém informações das sessões:
- Quando cada usuário fez login
- Último acesso
- Quando fez logout
- Duração total da sessão

**Limite**: Mantém apenas as últimas 1.000 sessões

---

## 🔍 Casos de Uso

### 1. **Identificar Uso Recorrente**
```
Ir a /admin/access-logs
→ Filtrar por um usuário específico
→ Ver o histórico de quando ele acessa
→ Padrões: Se acessa sempre às 9h, semanal, etc.
```

### 2. **Monitorar Atividade em Tempo Real**
```
Ir a /admin/access-logs
→ Ver a seção "Usuários Online Agora"
→ Saber exatamente quem está usando o sistema
→ Ver qual foi o último acesso de cada um
```

### 3. **Encontrar Funcionalidades Mais Usadas**
```
Ir a /admin/access-logs
→ Ver "Top Páginas Acessadas"
→ Identificar quais features são mais importantes
→ Priorizar desenvolvimento/correções
```

### 4. **Garantir Sessões de 3h**
```
Usuário faz login às 10:00
→ Se não acessar até 13:00, sessão expira
→ Próxima tentativa de acesso o redireciona para login
→ Você pode ver isso no histórico de "Logout"
```

---

## 🛠️ Implementação Técnica

### Arquivos Modificados

1. **`lib/session.ts`**
   - Alterado timeout de 30 dias para 3 horas
   - Token JWT agora expira em 3h

2. **`lib/activity-logger.ts`** (NOVO)
   - Funções para registrar atividades
   - Funções para query de histórico
   - Gerenciamento de sessões

3. **`lib/admin-auth.ts`** (NOVO)
   - Helper para validar sessão de admin
   - Usado pelas APIs e páginas de admin

4. **`middleware.ts`**
   - Adicionado logging de todas as requisições
   - Adicionado validação de admin para rotas `/admin/*`
   - Chamadas assíncronas de logging que não bloqueiam requisições

5. **`app/api/auth/login/route.ts`**
   - Adicionado logging de login
   - Cookie maxAge alterado para 3 horas

6. **`app/api/auth/logout/route.ts`**
   - Adicionado logging de logout

### Novas Rotas de API

- `GET /api/admin/access-logs` - Histórico de acessos
- `GET /api/admin/user-sessions` - Informações de sessões
- `GET /api/admin/statistics` - Estatísticas agregadas

### Nova Página de Admin

- `GET /admin/access-logs` - Dashboard visual

---

## ⚙️ Configuração

Nenhuma configuração adicional necessária! O sistema funciona automaticamente com:

- `SESSION_SECRET` ou `ADMIN_PASSWORD` já configurados
- Dados são salvos automaticamente em `data/`

### Variáveis de Ambiente (Existentes)

```env
SESSION_SECRET=sua-chave-secreta (ou gerada automaticamente com ADMIN_PASSWORD)
ADMIN_PASSWORD=sua-senha-admin
ADMIN_EMAIL=seu-email-admin
```

---

## 📝 Notas Importantes

1. **Logs ocupam espaço**: Os logs crescem com o tempo. Máximo de 10.000 logs e 1.000 sessões são mantidos.

2. **Inatividade de 3h**: O timeout começa quando o usuário faz login. Cada acesso não renova o token - ele expira após 3h desde o login.

3. **Backup dos dados**: Considere fazer backup dos arquivos em `data/activity-logs.json` e `data/user-sessions.json` periodicamente.

4. **Apenas admins**: Apenas usuários com role `admin` podem acessar `/admin/access-logs` e as APIs de admin.

5. **Assincronismo**: Os logs são registrados de forma assíncrona e não bloqueiam as requisições do usuário, garantindo performance.

---

## 🚀 Próximos Passos Opcionais

- [ ] Exportar logs para CSV/JSON
- [ ] Alertas quando muitos logins falhados
- [ ] Gráficos de atividade ao longo do tempo
- [ ] Limpeza automática de logs antigos
- [ ] Dashboard com métricas mais detalhadas

---

## ❓ FAQ

**P: O que acontece quando uma sessão expira?**
R: O token JWT expira automaticamente após 3h. Na próxima requisição, o usuário é redirecionado para `/login`.

**P: Como os logs são armazenados?**
R: Em arquivos JSON no diretório `data/`. Você pode fazer backup ou migrar para um banco de dados real conforme necessário.

**P: Posso ver apenas logs de um usuário específico?**
R: Sim! Use o filtro "Filtrar por usuário" no dashboard ou o parâmetro `?username=` na API.

**P: Os logs consomem muita memória?**
R: Não, apenas últimos 10.000 logs são mantidos. O arquivo é mantido compacto.

**P: Posso customizar o timeout de 3 horas?**
R: Sim! Altere o valor em `lib/session.ts` na função `createSessionToken()`.
