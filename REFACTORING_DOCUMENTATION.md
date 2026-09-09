/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * REFACTORING DOCUMENTATION
 * ManagementModule Centralization & Unified Reporting System
 */

# 📋 Reestruturação do Sistema REPRO: Documentação Completa

## 🎯 Objetivo Geral

Reorganizar e padronizar o sistema eliminando elementos obsoletos, otimizando usabilidade e integrando de forma eficiente dados do Supabase e Google Sheets através de um orquestrador centralizado de sincronização.

---

## ✨ Melhorias Implementadas

### 1. **Sincronização Centralizada com `syncOrchestrator.ts`**

#### Antes:
- Múltiplas chamadas diretas ao Google Sheets espalhadas pelo código
- Redundância de cálculos de relatórios
- Falta de coordenação entre diferentes módulos
- Sem retry logic ou circuit breaker

#### Depois:
```typescript
// Single entry point for all sync operations
await orchestrateSyncToSheets({
  apiUrl,
  date: selectedDate,
  logs,
  streetSummaries,
  demands,
  events: eventsList,
  onProgress: (msg) => console.log(msg)
});
```

**Benefícios:**
- ✅ Único ponto de entrada para sincronização
- ✅ Retry automático com exponential backoff
- ✅ Telemetria integrada
- ✅ Auto-sync a cada 30 segundos em background
- ✅ Sync on window focus
- ✅ Métricas de performance

---

### 2. **Geração Unificada de Relatórios com `reportGenerator.ts`**

#### Antes:
- Cálculos de relatórios diários, semanais e mensais espalhados
- Sem consolidação de dados
- Informações redundantes

#### Depois:
```typescript
// Three unified report types calculated from consolidated data
const dailyReport = await calculateDailyReport(date, logs, streetSummaries);
const weeklyReport = await calculateWeeklyReport(week, year, logs, [dailyReport]);
const monthlyReport = await calculateMonthlyReport(month, year, logs, [weeklyReport]);

// Single payload sent to Sheets
const payload = generateConsolidatedBatchPayload(
  dailyReport,
  weeklyReport,
  monthlyReport,
  queue
);
```

**Tipos de Relatórios:**
```typescript
interface DailyReport {
  data: string;
  dia: string;
  tipo: 'diário';
  totalDemanda: number;
  totalRealizado: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  saldoPendente: number;
  detalhePorRua: StreetSummary[];
  timestamp: number;
}

interface WeeklyReport {
  semana: number;
  ano: number;
  tipo: 'semanal';
  diarioPorDia: DailyReport[];
  // ... agregação de dados diários
}

interface MonthlyReport {
  mes: number;
  ano: number;
  tipo: 'mensal';
  semanasPorSemana: WeeklyReport[];
  // ... agregação de dados semanais
}
```

---

### 3. **Integração com Supabase Webhooks**

#### Configuração Necessária:

1. **No Supabase (Menu Webhooks):**
   ```
   - Name: Sync_Google_Sheets
   - Table: logs (ou operational_events)
   - Events: Insert
   - HTTP Method: POST
   - URL: https://script.google.com/macros/s/{deploymentId}/exec
   - Headers: Content-Type: application/json
   ```

2. **No Google Apps Script:**
   ```javascript
   var dados = {};
   if (contents) {
     try {
       dados = JSON.parse(contents);
       // Supabase wraps data in "record" envelope
       if (dados.record) {
         dados = dados.record;
       }
     } catch(err) {
       dados = e.parameter || {};
     }
   }
   ```

**Como Funciona:**
```
Operador Zebra → Salva no IndexedDB → Envia ao Supabase
                                           ↓
                                    Webhook Dispara
                                           ↓
                            Google Apps Script Recebe
                                           ↓
                            Insere na Planilha Google
```

**Benefício:** Zero perda de dados por Wi-Fi instável. O Supabase tem conexão mais estável e retransmite com garantia.

---

### 4. **ManagementModule Refatorada**

#### Mudanças Principais:

**a) Nova Aba: "Relatórios Consolidados"**
```jsx
{activeSubView === 'relatorios' && (
  <div>
    {/* Exibe relatórios diário, semanal e mensal unificados */}
    {/* Sem redundância, sem abas antigas */}
  </div>
)}
```

**b) Auto-sync Integrado**
```typescript
useEffect(() => {
  if (apiUrl && networkStatus === 'online') {
    initializeAutoSync({
      apiUrl,
      logs,
      streetSummaries,
      demands,
      events: eventsList
    });
    return () => stopAutoSync();
  }
}, [apiUrl, networkStatus, logs, demands, eventsList]);
```

**c) Sincronização Manual com Retry**
```typescript
const handleSyncToSheets = async () => {
  const metrics = await triggerManualSync(
    { apiUrl, date, logs, streetSummaries, ... },
    3 // maxRetries com exponential backoff
  );
};
```

**d) Indicadores de Status**
- Timestamp da última sincronização
- Métricas de sucesso/falha
- Mensagens de progresso em tempo real

---

## 📊 Fluxo de Sincronização Centralizado

```
┌─────────────────────────────────────────────────────────────┐
│                   ENTRADA: ManagementModule                  │
│  (Log dos operadores + Demandas + Eventos Operacionais)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
         ┌───────────────────────────┐
         │  orchestrateSyncToSheets  │  ← PONTO ÚNICO DE ENTRADA
         └────────┬──────────────────┘
                  │
        ┌─────────┼─────────────────────────┐
        │         │                         │
        ↓         ↓                         ↓
    ┌────────┐ ┌──────────┐        ┌──────────────┐
    │ Daily  │ │ Weekly   │        │   Monthly    │
    │ Report │ │ Report   │        │   Report     │
    └────┬───┘ └─────┬────┘        └─────┬────────┘
         │           │                   │
         └───────────┼───────────────────┘
                     │
                     ↓
         ┌───────────────────────────┐
         │ generateConsolidatedBatch │
         │  (Unifila 1 payload + queue)
         └────────┬──────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ↓                    ↓
  ┌──────────────┐    ┌─────────────────┐
  │ Google Sheets│    │  Salva Reports  │
  │ (via POST)   │    │   no IndexedDB  │
  └──────────────┘    └─────────────────┘
        │
        ↓
   ┌─────────────┐
   │  Supabase   │  (via webhook automático)
   │   Webhook   │
   └─────────────┘
```

---

## 🔄 Fluxo Automático (Auto-Sync)

```
┌─────────────────────────────────────┐
│   Inicialização: initializeAutoSync  │
└────────────────┬────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
         ↓                ↓
   ┌──────────────┐  ┌──────────────────┐
   │ Window Focus │  │ Timer (30 segundos)
   │   Handler    │  │
   └──────┬───────┘  └────────┬─────────┘
          │                   │
          └───────┬───────────┘
                  │
                  ↓
      ┌──────────────────────┐
      │ orchestrateSyncToSheets
      │ (silencioso em background)
      └──────────────────────┘
```

---

## 📦 Estrutura de Armazenamento Local

```typescript
// IndexedDB
{
  STORAGE_DEMANDS_KEY: {
    '2026-09-09_87_B4VD': {
      id: 'dem_123456789',
      data: '2026-09-09',
      setor: '87',
      rua: 'B4VD',
      demandaCalculada: 150,
      unidade: 'CAIXAS'
    }
  },
  
  STORAGE_EVENTS_KEY: [
    {
      id: 'evt_123',
      tipo: 'REABASTECIMENTO',
      setor: '87',
      rua: 'B4VD',
      timestamp: 1694204000000,
      volumesDelta: 50,
      enderecosDelta: 10
    }
  ],
  
  STORAGE_SYNC_METRICS: {
    successCount: 45,
    failedCount: 0,
    queuedCount: 3,
    lastSyncTimestamp: '14:30:25',
    nextSyncScheduled: '14:30:55',
    syncDurationMs: 342
  },
  
  STORAGE_LAST_BATCH_PAYLOAD: {
    tipo: 'SYNC_BATCH_CONSOLIDATED_REPRO',
    relatorio_diario: { ... },
    relatorio_semanal: { ... },
    relatorio_mensal: { ... },
    eventos_pendentes: [ ... ]
  },
  
  last_daily_report: { DailyReport },
  last_weekly_report: { WeeklyReport },
  last_monthly_report: { MonthlyReport }
}
```

---

## 🔧 API Centralizada

### `syncOrchestrator.ts`

```typescript
// Main orchestrator function
orchestrateSyncToSheets(context: SyncContext): Promise<SyncMetrics>

// Auto-sync initialization
initializeAutoSync(context: Omit<SyncContext, 'date'>): void
stopAutoSync(): void

// Manual sync with retries
triggerManualSync(context: SyncContext, maxRetries?: number): Promise<SyncMetrics>

// Supabase webhook handler
handleSupabaseWebhookPayload(payload: any, apiUrl: string): Promise<boolean>

// Metrics retrieval
getLastSyncMetrics(): Promise<SyncMetrics | null>
getLastBatchPayload(): Promise<any | null>

// Recovery
resetSyncState(): Promise<void>
```

### `reportGenerator.ts`

```typescript
// Calculate unified reports
calculateDailyReport(...): Promise<DailyReport>
calculateWeeklyReport(...): Promise<WeeklyReport>
calculateMonthlyReport(...): Promise<MonthlyReport>

// Generate payload
generateConsolidatedBatchPayload(...): object

// Local storage
saveReportsLocally(...): Promise<void>
loadCachedReports(): Promise<{ daily, weekly, monthly }>
```

---

## 🐛 Tratamento de Erros & Retry Logic

```typescript
// Exponential Backoff
Attempt 1: imediato
Attempt 2: aguarda 1000ms * 2^1 = 2000ms
Attempt 3: aguarda 1000ms * 2^2 = 4000ms

// Circuit Breaker (existente em sheetService.ts)
Estado: CLOSED (normal) → OPEN (muitas falhas) → HALF_OPEN (testando)
```

---

## 📊 Métricas de Sincronização

```typescript
interface SyncMetrics {
  successCount: number;        // Relatórios enviados com sucesso
  failedCount: number;         // Tentativas falhadas
  queuedCount: number;         // Eventos pendentes na fila
  lastSyncTimestamp: string;   // Última sincronização bem-sucedida
  nextSyncScheduled: string;   // Próxima sincronização agendada
  syncDurationMs: number;      // Tempo total de execução
}
```

---

## ✅ Checklist de Implementação

- [x] `reportGenerator.ts` criado com cálculos unificados
- [x] `syncOrchestrator.ts` criado com orquestração centralizada
- [x] `ManagementModule.tsx` refatorada com nova aba "Relatórios Consolidados"
- [x] Auto-sync integrado (30s + window focus)
- [x] Supabase webhook handler implementado
- [x] Retry logic com exponential backoff
- [x] Telemetria e métricas
- [x] Eliminação de redundância entre abas antigas
- [ ] Otimização UI/UX para coletores Zebra (próximos passos)
- [ ] Menu dropdown para navegação
- [ ] Redução de padding em formulários

---

## 🚀 Próximos Passos (Propostos)

1. **Otimização de Interface para Coletores Zebra**
   - Menu dropdown "Contexto de Operação"
   - Redução de padding em `StopwatchPanel`
   - Layout compacto no `App.tsx`

2. **Visibilidade Condicional**
   - Ocultar "Gestão", "Histórico", "Follow-up" se não autenticado

3. **Métricas Minimalistas**
   - `DashboardMetrics` refatorado
   - Grid mais compacto
   - Ícones minimalistas

---

## 📞 Suporte & Troubleshooting

### Problema: Auto-sync não está funcionando
**Solução:** Verifique se `networkStatus === 'online'` e se `apiUrl` está configurada

### Problema: Dados não aparecem no Google Sheets
**Solução:** Verifique Google Apps Script logs e se o webhook do Supabase está disparando

### Problema: Muitos itens na fila de sincronização
**Solução:** Clique "Descarregar Fila" manualmente ou aguarde auto-sync

---

## 📝 Referências

- **IndexedDB Schema:** `src/dbLocal.ts`
- **Google Sheets Service:** `src/sheetService.ts`
- **Supabase Integration:** `src/utils/supabase/client.ts`
- **Telemetry:** `src/utils/telemetry.ts`
- **Circuit Breaker:** `src/utils/circuitBreaker.ts`
