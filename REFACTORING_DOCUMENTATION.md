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
Benefícios:

✅ Único ponto de entrada para sincronização
✅ Retry automático com exponential backoff
✅ Telemetria integrada
✅ Auto-sync a cada 30 segundos em background
✅ Sync on window focus
✅ Métricas de performance

### 2. Geração Unificada de Relatórios com `reportGenerator.ts`

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

### 3. Integração com Supabase Webhooks

Configuração Necessária:
No Supabase (Menu Webhooks):
- Name: Sync_Google_Sheets
- Table: logs (ou operational_events)
- Events: Insert
- HTTP Method: POST
- URL: https://script.google.com/macros/s/{deploymentId}/exec
- Headers: Content-Type: application/json

Como Funciona:
Operador Zebra → Salva no IndexedDB → Envia ao Supabase → Webhook Dispara → Google Apps Script Recebe → Insere na Planilha Google

### 4. ManagementModule Refatorada

Mudanças Principais:
a) Nova Aba: "Relatórios Consolidados"
b) Auto-sync Integrado
c) Sincronização Manual com Retry
d) Indicadores de Status

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
- [x] Otimização UI/UX para coletores Zebra (menu dropdown, padding, visibilidade condicional)
