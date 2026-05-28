# 🎓 Exemplos Práticos de Uso do Sistema de Tracking

## Exemplo 1: Descobrir Qual Feature é Mais Usada

### Seu Objetivo
Você tem 3 features principais:
- Dashboard de arbitragem
- P2P arbitrage
- Spot-futures arbitrage

E quer saber qual é mais usada.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Procure a seção "Top Páginas Acessadas"**
   ```
   /arbitragem-scanner ..................... 523 acessos
   /p2p ..................................... 189 acessos
   /spot-futures ............................ 87 acessos
   /fan-tokens ............................. 156 acessos
   ```

3. **Interpretação**
   - 🏆 Arbitragem é a feature mais usada (523 acessos)
   - Dashboard de fan-tokens também é popular (156)
   - P2P e spot-futures têm menos uso

4. **Ação**
   - Priorizar melhorias na arbitragem-scanner
   - Considerar remover ou deprecar spot-futures se for caro manter

---

## Exemplo 2: Rastrear Quando Um Usuário Específico Acessa

### Seu Objetivo
Você quer entender o padrão de uso do usuário "cliente1".

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Procure a seção "Histórico de Acessos"**

3. **Use o filtro "Filtrar por usuário"**
   ```
   [Digite: cliente1]
   ```

4. **Veja o histórico completo**
   ```
   cliente1 | 🔓 Login  | /api/auth/login        | 28/05/2026 09:00
   cliente1 | 📄 Página | /arbitragem-scanner   | 28/05/2026 09:01
   cliente1 | 📄 Página | /p2p                  | 28/05/2026 09:15
   cliente1 | 📄 Página | /admin                | 28/05/2026 09:30
   cliente1 | 📄 Página | /arbitragem-scanner   | 28/05/2026 09:45
   cliente1 | 🔓 Login  | /api/auth/login        | 28/05/2026 13:05
   cliente1 | 📄 Página | /arbitragem-scanner   | 28/05/2026 13:06
   cliente1 | 🔒 Logout | /api/auth/logout       | 28/05/2026 13:10
   ```

5. **Interpretação**
   - Acessou pela manhã (9h) e tarde (13h)
   - Ficar 4h offline = sessão expirada e refez login às 13h
   - Acessou principalmente arbitragem (60% dos acessos)
   - Padrão: Manhã e tarde, com intervalo no meio do dia

6. **Ação**
   - Se cliente1 é importante: comunicar sobre timeout de 3h
   - Se muitos clientes desconectam e reconectam: aumentar timeout?

---

## Exemplo 3: Monitorar Atividade em Tempo Real

### Seu Objetivo
Você quer saber AGORA quem está usando o sistema.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Procure a seção "Usuários Online Agora"**
   ```
   ┌─────────────────────────────────────────┐
   │ Usuários Online Agora                 │
   ├─────────────────────────────────────────┤
   │ thiago@sagacy.com.br | 👤 Admin       │
   │ 28/05/2026 14:00     | Último: 14:45  │
   │ Duração: 45m 30s                      │
   │                                        │
   │ cliente1 | 👤 User                     │
   │ 28/05/2026 14:30     | Último: 14:44   │
   │ Duração: 14m 22s                      │
   │                                        │
   │ cliente2 | 👤 User                     │
   │ 28/05/2026 14:35     | Último: 14:46   │
   │ Duração: 11m 05s                      │
   └─────────────────────────────────────────┘
   ```

3. **Interpretação**
   - Você está online há 45 minutos
   - 2 clientes também estão online
   - Ninguém passou de 3h (sessões ainda ativas)
   - cliente2 acaba de acessar (11 minutos)

4. **Ação**
   - Você sabe que há atividade agora
   - Pode ver quem está usando antes de fazer manutenção
   - Sabe quem são os usuários mais ativos

---

## Exemplo 4: Descobrir Sessão que Expirou

### Seu Objetivo
Você quer confirmar que o timeout de 3h está funcionando.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Procure a seção "Histórico de Acessos"**

3. **Procure por padrão: Login → ... → (3h depois) → Login novamente**
   ```
   cliente1 | 🔓 Login  | /api/auth/login     | 28/05 09:00
   cliente1 | 📄 Página | /arbitragem-scanner | 28/05 09:01
   cliente1 | 📄 Página | /p2p                | 28/05 11:00
   
   [Sem atividade por 2h, sessão expira às 12:00]
   
   cliente1 | 🔓 Login  | /api/auth/login     | 28/05 13:30  ← Nova sessão!
   cliente1 | 📄 Página | /arbitragem-scanner | 28/05 13:31
   ```

4. **Interpretação**
   - Último acesso antes de expiração: 11h
   - Próximo acesso: 13h30 (2h30 depois)
   - Sistema força novo login ✅

---

## Exemplo 5: Comparar Uso Antes e Depois

### Seu Objetivo
Você lançou uma nova feature na segunda-feira e quer medir se aumentou o uso.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Mude o filtro para "Últimos 7 dias"**

3. **Anote a estatística de "Total de Acessos"**
   ```
   Antes (sem feature): 234 acessos/dia média
   Depois (com feature): 287 acessos/dia média
   
   Aumento: +23% ✅
   ```

4. **Confira "Top Páginas Acessadas"**
   ```
   Antes: /arbitragem-scanner era #1
   Depois: /nova-feature é #1, /arbitragem-scanner é #2
   ```

5. **Ação**
   - Feature é um sucesso!
   - Considere melhorar mais
   - Desloque recursos se necessário

---

## Exemplo 6: Auditar Acesso de Usuário Específico

### Seu Objetivo
Um cliente reclamou que não conseguia acessar, você quer verificar.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Filtrar por usuário do cliente**
   ```
   [Digite: cliente@email.com]
   ```

3. **Procure por padrão de erro (acessos recusados)**
   ```
   cliente@email.com | 🔓 Login | /api/auth/login | 28/05 10:00 ✓
   cliente@email.com | 📄 Página | /admin | 28/05 10:01 ✗ (Acesso negado?)
   ```

4. **Se vir muitas recusas de acesso**
   - Pode ser que o cliente não seja admin mas está tentando acessar admin
   - Problema de permissões
   - Comunique ao cliente

5. **Se vir login mas depois nenhum acesso**
   - Pode ser problema de rede/frontend
   - Peça ao cliente para testar novamente

---

## Exemplo 7: Entender Picos de Tráfego

### Seu Objetivo
Você quer saber em que horários há mais uso.

### O que fazer

1. **Acesse o dashboard**
   ```
   URL: https://seu-site/admin/access-logs
   ```

2. **Filtre para "Últimas 24h"**

3. **Procure no "Histórico de Acessos" por padrão temporal**
   ```
   09:00 - 11:00: Muitos acessos (pico da manhã)
   11:00 - 14:00: Poucos acessos (pausa do almoço)
   14:00 - 17:00: Muitos acessos (tarde)
   17:00+: Nenhum acesso (fim do expediente)
   ```

4. **Interpretação**
   - Seus usuários trabalham 9-17
   - Picos são manhã (9-11) e tarde (14-17)
   - Manutenção deve ser feita depois das 18h

5. **Ação**
   - Agendar backups/manutenção para após 18h
   - Ter suporte disponível 9-17
   - Considerar alertas para uso fora do horário (anomalia)

---

## Exemplo 8: Usar a API Programaticamente

### Seu Objetivo
Você quer integrar os dados com seu próprio sistema.

### Código (Python/JavaScript)

```python
import requests
import json

# Substituir pelo seu domínio e token
DOMAIN = "https://seu-site"
SESSION_COOKIE = "seutoken"

def get_statistics():
    """Buscar estatísticas dos últimos 7 dias"""
    headers = {
        "Cookie": f"usdtbot_session={SESSION_COOKIE}"
    }
    
    response = requests.get(
        f"{DOMAIN}/api/admin/statistics?days=7",
        headers=headers
    )
    
    stats = response.json()["stats"]
    
    print(f"Logins: {stats['totalLogins']}")
    print(f"Total de acessos: {stats['totalAccess']}")
    print(f"Usuários ativos: {stats['activeUsers']}")
    
    print("\nTop 5 páginas:")
    for page in stats['topPages'][:5]:
        print(f"  {page['page']}: {page['count']} acessos")
    
    print("\nTop 5 usuários:")
    for user in stats['topUsers'][:5]:
        print(f"  {user['username']}: {user['count']} acessos")

def get_online_users():
    """Buscar usuários online agora"""
    headers = {
        "Cookie": f"usdtbot_session={SESSION_COOKIE}"
    }
    
    response = requests.get(
        f"{DOMAIN}/api/admin/user-sessions",
        headers=headers
    )
    
    sessions = response.json()["sessions"]
    online = [s for s in sessions if s['isActive']]
    
    print(f"Usuários online agora: {len(online)}")
    for session in online:
        print(f"  {session['username']} - Online há {session['sessionDuration']}")

# Executar
get_statistics()
print("\n" + "="*50 + "\n")
get_online_users()
```

### Casos de Uso
- Integrar com Slack: "@admin, você tem 3 usuários online agora"
- Integrar com dashboard: Mostrar gráficos
- Integrar com alertas: "Nenhum acesso em 24h, sistema pode estar down?"

---

## 🎯 Resumo de Cenários

| Cenário | Como Fazer | Resultado |
|---------|-----------|-----------|
| Ver quem está online | Dashboard → "Usuários Online Agora" | Lista em tempo real |
| Qual feature é mais usada | Dashboard → "Top Páginas" | Priorizar desenvolvimento |
| Quando usuário acessa | Dashboard → Filtro por usuário | Padrão de uso |
| Verificar timeout de 3h | Dashboard → Ver gaps de 3h entre logins | Confirmar segurança |
| Auditoria de usuário | Dashboard → Filtro por usuário | Investigar problemas |
| Picos de tráfego | Dashboard → Histórico com horários | Agendar manutenção |
| Comparar períodos | Mudar filtro de dias | Medir crescimento |
| Integração customizada | Usar APIs | Seus próprios gráficos |

---

**Divirta-se explorando os dados! 🚀**
