/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SISTEMA REPRO v2.0 - DOCUMENTAÇÃO COMPLETA
 * Arquitetura, Implementação e Guias de Uso
 */

# 📚 SISTEMA REPRO v2.0 - DOCUMENTAÇÃO COMPLETA

**Versão:** 2.0  
**Data:** Setembro 2026  
**Status:** ✅ Produção  
**Linguagem Principal:** TypeScript 93.6%

---

## 📑 Índice

1. [Visão Geral do Sistema](#visão-geral-do-sistema)
2. [Arquitetura](#arquitetura)
3. [Componentes Principais](#componentes-principais)
4. [Fluxo de Dados](#fluxo-de-dados)
5. [Sincronização & Webhooks](#sincronização--webhooks)
6. [Relatórios Consolidados](#relatórios-consolidados)
7. [Otimização UI/UX](#otimização-uiux)
8. [Instalação & Setup](#instalação--setup)
9. [API de Desenvolvimento](#api-de-desenvolvimento)
10. [Troubleshooting](#troubleshooting)
11. [Roadmap Futuro](#roadmap-futuro)

---

## 🎯 Visão Geral do Sistema

### O Que É REPRO?

**REPRO** (Reabastecimento e Produtividade em Tempo Real) é um sistema web-mobile para operações logísticas que:

- 📱 Coleta dados de reabastecimento em campo via PWA/Zebra
- 📊 Consolida informações em tempo real
- 📈 Gera relatórios unificados (diário/semanal/mensal)
- 🔄 Sincroniza com Google Sheets e Supabase automaticamente
- 📡 Funciona offline com sincronização em background

### Tecnologias Utilizadas

```
Frontend:
  - React 18+ (TypeScript)
  - Tailwind CSS
  - Lucide Icons
  - IndexedDB (Offline Storage)

Backend:
  - Supabase (PostgreSQL + Realtime)
  - Google Apps Script
  - Google Sheets API

Infraestrutura:
  - Vercel (Deploy)
  - GitHub (Versionamento)
  - Supabase Cloud
```

---

## 🏗️ Arquitetura

### Diagram de Alto Nível

```
┌────────────────────────────────────────────────────────────────┐
│                    CAMADA DE APRESENTAÇÃO                      │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │   App.tsx        │  │ ManagementModule │  │ StopWatch   │ │
│  │  (Shell)         │  │  (Gestão)        │  │  (Coleta)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬──────┘ │
│           │                     │                    │        │
└───────────┼─────────────────────┼────────────────────┼────────┘
            │                     │                    │
            ↓                     ↓                    ↓
┌────────────────────────────────────────────────────────────────┐
│                   CAMADA DE NEGÓCIO                            │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │          syncOrchestrator.ts (CENTRALIZADOR)            │  │
│  │  - orchestrateSyncToSheets()                            │  │
│  │  - handleSupabaseWebhookPayload()                       │  │
│  │  - triggerManualSync()                                  │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                          │
│     ┌───────────────┼──────────────────────┐                   │
│     ↓               ↓                      ↓                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐                │
│  │ Report   │  │ Sheet    │  │ Supabase     │               │
│  │Generator │  │Service   │  │Client        │               │
│  └──────────┘  └──────────┘  └──────────────┘               │
└────────────────────────────────────────────────────────────────┘
            │                   │                   │
            ↓                   ↓                   ↓
┌────────────────────────────────────────────────────────────────┐
│                   CAMADA DE PERSISTÊNCIA                        │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │   IndexedDB      │  │  Google Sheets   │  │  Supabase   │ │
│  │  (Offline)       │  │  (Cloud)         │  │  (Cloud)    │ │
│  └──────────────────┘  └──────────────────┘  └─────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Padrões de Design

- **Orquestração:** `syncOrchestrator.ts` coordena todas as operações
- **Geração de Relatórios:** `reportGenerator.ts` calcula dados consolidados
- **Persistência:** `dbLocal.ts` gerencia IndexedDB
- **Telemetria:** `telemetry.ts` monitora operações
- **Circuit Breaker:** Proteção contra sobrecarga

---

## 🔧 Componentes Principais

### 1. `syncOrchestrator.ts` (Orquestrador Central)

**Responsabilidade:** Único ponto de entrada para todas as sincronizações

```typescript
// Função Principal
orchestrateSyncToSheets(context: SyncContext): Promise<SyncMetrics>

// Contexto Necessário
interface SyncContext {
  apiUrl: string;              // URL do Google Apps Script
  date: string;                // Data YYYY-MM-DD
  logs: Log[];                 // Dados coletados
  streetSummaries: StreetSummary[];  // Resumo por rua
  demands?: Record<string, ReproDemand>;  // Demandas
  events?: OperationalEvent[];         // Eventos operacionais
  onProgress?: (msg: string) => void;  // Callback de progresso
}

// Saída
interface SyncMetrics {
  successCount: number;        // Relatórios sincronizados
  failedCount: number;         // Falhas
  queuedCount: number;         // Pendentes
  lastSyncTimestamp: string;   // Última sincronização
  nextSyncScheduled: string;   // Próxima agendada
  syncDurationMs: number;      // Tempo total
}
```

**Fluxo Interno:**

```
1. Calcula Relatórios Unificados
   ├─ Daily Report (data do dia)
   ├─ Weekly Report (semana atual)
   └─ Monthly Report (mês atual)

2. Recupera Fila de Eventos
   └─ getOperationalSyncQueue()

3. Gera Payload Consolidado
   └─ generateConsolidatedBatchPayload()

4. Envia para Google Sheets
   └─ postBatchToGoogleSheets()

5. Limpa Eventos Processados
   └─ clearOperationalSyncQueue()

6. Salva Reports Localmente
   └─ saveReportsLocally()

7. Atualiza Métricas
   └─ saveState(STORAGE_SYNC_METRICS)
```

---

### 2. `reportGenerator.ts` (Gerador de Relatórios)

**Responsabilidade:** Calcular relatórios consolidados sem redundância

```typescript
// Tipos de Relatórios

interface DailyReport {
  data: string;                    // DD/MM/YYYY
  dia: string;                     // Nome do dia
  tipo: 'diário';
  totalDemanda: number;            // Volume total esperado
  totalRealizado: number;          // Volume total realizado
  totalEnderecos: number;          // Endereços processados
  totalHoras: number;              // Tempo total gasto
  ephGlobal: string;               // Endereços por Hora
  vphGlobal: string;               // Volumes por Hora
  coberturaGlobal: number;         // % de cobertura
  saldoPendente: number;           // Diferença demanda-realizado
  ruasAtendidas: number;           // Ruas finalizadas
  totalRuas: number;               // Total de ruas
  detalhePorRua: StreetSummary[]; // Breakdown por rua
  timestamp: number;               // Data/hora cálculo
}

interface WeeklyReport {
  semana: number;                  // Número da semana (1-53)
  ano: number;                     // Ano
  tipo: 'semanal';
  dataInicio: string;              // Primeira data
  dataFim: string;                 // Última data
  totalDemanda: number;            // Agregação de daily
  totalRealizado: number;
  totalEnderecos: number;
  totalHoras: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  diarioPorDia: DailyReport[];    // 7 dias da semana
  timestamp: number;
}

interface MonthlyReport {
  mes: number;                     // 1-12
  ano: number;
  tipo: 'mensal';
  dataInicio: string;              // Primeira data do mês
  dataFim: string;                 // Última data do mês
  totalDemanda: number;            // Agregação de weekly
  totalRealizado: number;
  totalEnderecos: number;
  totalHoras: number;
  ephGlobal: string;
  vphGlobal: string;
  coberturaGlobal: number;
  semanasPorSemana: WeeklyReport[]; // 4-5 semanas
  timestamp: number;
}
```

**Funções Exportadas:**

```typescript
calculateDailyReport(
  selectedDate: string,
  logs: Log[],
  streetSummaries: StreetSummary[],
  demands?: Record<string, ReproDemand>
): Promise<DailyReport>

calculateWeeklyReport(
  semana: number,
  ano: number,
  logs: Log[],
  dailyReports: DailyReport[]
): Promise<WeeklyReport>

calculateMonthlyReport(
  mes: number,
  ano: number,
  logs: Log[],
  weeklyReports: WeeklyReport[]
): Promise<MonthlyReport>

generateConsolidatedBatchPayload(
  dailyReport: DailyReport,
  weeklyReport: WeeklyReport,
  monthlyReport: MonthlyReport,
  queue: any[]
): object

saveReportsLocally(
  dailyReport: DailyReport,
  weeklyReport: WeeklyReport,
  monthlyReport: MonthlyReport
): Promise<void>

loadCachedReports(): Promise<{
  daily: DailyReport | null;
  weekly: WeeklyReport | null;
  monthly: MonthlyReport | null;
}>
```

---

### 3. `ManagementModule.tsx` (Painel de Gestão)

**Responsabilidade:** Interface para sincronização, visualização de relatórios e eventos

**Abas Principais:**

| Aba | Visibilidade | Função |
|-----|--------------|---------|
| Resumo por Rua | Sempre | Visualiza detalhes por rua |
| **Relatórios Consolidados** | Sempre | ✨ **NOVO** - Exibe daily/weekly/monthly unificados |
| Trilha de Eventos | Sempre | Fila de sincronização |
| ODBC & Auditoria | Sempre | Consultas ao banco |
| Sheets Config | Sempre | Configuração de URL |
| Diagnóstico | Sempre | Telemetria e status |

**Estado Interno:**

```typescript
const [selectedDate, setSelectedDate] = useState('2026-09-09');
const [selectedSector, setSelectedSector] = useState('TODOS');
const [activeSubView, setActiveSubView] = useState('resumo');

// Sincronização
const [isSyncingSheets, setIsSyncingSheets] = useState(false);
const [syncMetrics, setSyncMetrics] = useState<SyncMetrics | null>(null);
const [syncProgressMsg, setSyncProgressMsg] = useState('');

// Dados Locais
const [demands, setDemands] = useState<Record<string, ReproDemand>>({});
const [eventsList, setEventsList] = useState<OperationalEvent[]>([]);
const [syncQueueItems, setSyncQueueItems] = useState<any[]>([]);
```

---

### 4. `dbLocal.ts` (Camada de Armazenamento)

**Responsabilidade:** Gerenciar IndexedDB com anti-padrão N+1

```typescript
// Banco de Dados
DB_NAME = "TerminalReproV5"
DB_VERSION = 2

// Objetos Stores
logs: { keyPath: 'id' }
state: { keyPath: 'key' }

// Índices
logs.synced
logs.timestamp
logs.data
logs.setor
logs.colaborador
logs.setor_data (composto)

// Operações Principais
initDb(): Promise<IDBDatabase>
getLogs(): Promise<Log[]>
getUnsyncedLogs(): Promise<Log[]>
getLogsByDate(data: string): Promise<Log[]>
saveLog(log: Log): Promise<boolean>
saveLogsBulk(logs: Log[]): Promise<boolean>  // Anti-N+1
deleteLog(id: number): Promise<boolean>
getState<T>(key: string): Promise<T | null>
saveState<T>(key: string, data: T): Promise<boolean>
clearLogsAndState(): Promise<boolean>
```

---

### 5. `sheetService.ts` (Integração Google Sheets)

**Responsabilidade:** Comunicação com Google Apps Script

```typescript
// Configuração
normalizeSheetUrl(url: string): string
validateGoogleSheetUrl(url: string): { isValid, message, idFound? }

// Operações
postToGoogleSheets(apiUrl: string, log: Log): Promise<boolean>
postBatchToGoogleSheets(apiUrl: string, payload: unknown): Promise<boolean>
fetchFromGoogleSheets(apiUrl: string): Promise<Log[]>
postLogWithRetry(apiUrl: string, log: Log, userUid?: string): Promise<boolean>
syncOfflineQueue(apiUrl: string, onProgress?, userUid?): Promise<{ successCount, failedCount }>
fetchFromCloud(apiUrl: string, userUid?: string): Promise<Log[]>

// Testes
testApiConnection(apiUrl: string): Promise<{ success, message }>
pingGoogleSheetsEndpoint(apiUrl: string): Promise<{ success, latencyMs, message, details? }>
```

**Camadas de Fallback:**

```
Tier 1: Server-side proxy (/api/sheets/proxy)
   ├─ Mais seguro
   ├─ Não expõe chaves
   └─ Preferido em Cloud Run

Tier 2: Direct browser fetch (CORS)
   ├─ Tenta com Content-Type application/json
   ├─ Segue redirects
   └─ Confiável em boa conectividade

Tier 3: No-CORS fetch
   ├─ Request opaco
   ├─ Funciona em Vercel/GH Pages
   └─ Fallback confiável

Tier 4: Public CORS proxies
   ├─ api.allorigins.win
   ├─ corsproxy.io
   └─ Último recurso
```

---

## 📡 Fluxo de Dados

### 1. Fluxo de Coleta (Operador)

```
Operador Zebra
      ↓
[StopwatchPanel: Captura dados]
  - Setor: 87
  - Rua: B4VD
  - Artigo: 123456
  - Volumes: 50
  - Endereços: 10
  - Tempo: 15 minutos
      ↓
[Validação Local]
  - Verifica duplicidades
  - Calcula EPH/VPH
  - Gera ID único
      ↓
[IndexedDB - Armazenamento Local]
  - saveLog() → logs store
  - synced: false (inicial)
      ↓
[Interface: Toast ✅]
  "Dados salvos com sucesso"
      ↓
[Background: Fila de Sincronização]
  - enqueueOperationalEvent()
  - Aguarda sync automático
```

---

### 2. Fluxo de Sincronização Automática (30s)

```
Timer (30 segundos)
      ↓
initializeAutoSync() triggerado
      ↓
orchestrateSyncToSheets({
  apiUrl,
  date: hoje,
  logs,
  streetSummaries,
  demands,
  events: eventsList
})
      ↓
[Step 1: Calcular Relatórios]
  - calculateDailyReport()
  - calculateWeeklyReport()
  - calculateMonthlyReport()
      ↓
[Step 2: Recuperar Fila]
  - getOperationalSyncQueue()
  - Max 50 itens por lote
      ↓
[Step 3: Consolidar Payload]
  {
    tipo: 'SYNC_BATCH_CONSOLIDATED_REPRO',
    relatorio_diario: { ... },
    relatorio_semanal: { ... },
    relatorio_mensal: { ... },
    eventos_pendentes: [ ... ]
  }
      ↓
[Step 4: Enviar Google Sheets]
  postBatchToGoogleSheets()
    ├─ Tier 1: /api/sheets/proxy
    ├─ Tier 2: Direct CORS
    ├─ Tier 3: No-CORS
    └─ Tier 4: Public proxies
      ↓
[Step 5: Limpar Fila]
  clearOperationalSyncQueue(processedIds)
      ↓
[Step 6: Atualizar Métricas]
  setSyncMetrics({
    successCount: 1,
    failedCount: 0,
    queuedCount: 2,
    lastSyncTimestamp: "14:30:25",
    syncDurationMs: 342
  })
      ↓
[Interface: Indicadores]
  "✨ Sincronização concluída em 342ms!"
```

---

### 3. Fluxo de Webhook Supabase

```
Operador envia novo Log
      ↓
Salva em Supabase
      ↓
Webhook dispara (evento INSERT)
      ↓
POST https://script.google.com/macros/s/{id}/exec
  Payload: { type: "INSERT", record: { ... } }
      ↓
Google Apps Script doPost()
      ↓
[Desembrulha "record"]
  if (dados.record) {
    dados = dados.record;
  }
      ↓
[Processa e insere na Planilha]
      ↓
Sucesso ✅
  Dado chegou ao Sheets sem esperar auto-sync
```

---

## 📊 Sincronização & Webhooks

### Setup Supabase Webhook

**Menu:** Database → Webhooks → Create a new webhook

```
┌─────────────────────────────────────────┐
│ Name: Sync_Google_Sheets                │
├─────────────────────────────────────────┤
│ Table: logs                             │
│ Events: ☑ Insert                        │
│        ☐ Update                         │
│        ☐ Delete                         │
├─────────────────────────────────────────┤
│ HTTP Method: POST                       │
│ URL: https://script.google.com/macros/s/
│      {deploymentId}/exec                │
├─────────────────────────────────────────┤
│ HTTP Headers:                           │
│ Content-Type: application/json          │
├─────────────────────────────────────────┤
│ [Create webhook]                        │
└─────────────────────────────────────────┘
```

### Google Apps Script (doPost)

```javascript
function doPost(e) {
  var contents = e.postData.contents;
  var dados = {};
  
  if (contents) {
    try {
      dados = JSON.parse(contents);
      
      // PULO DO GATO: Supabase envia dentro de "record"
      if (dados.record) {
        dados = dados.record;
      }
    } catch(pjErr) {
      dados = e.parameter || {};
    }
  }
  
  // Processa dados normalmente
  var sheet = SpreadsheetApp.getActiveSheet();
  var values = [
    [
      new Date(),
      dados.setor,
      dados.rua,
      dados.artigo,
      dados.volumes,
      dados.enderecos,
      dados.horas,
      dados.vph,
      dados.tipo
    ]
  ];
  
  sheet.appendValues(values);
  
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Tratamento de Erros com Retry

```typescript
// Exponential Backoff
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    return await orchestrateSyncToSheets(context);
  } catch (err) {
    telemetry.warn(`Tentativa ${attempt} falhou`, err.message);
    
    if (attempt < maxRetries) {
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      // Delay: 1000ms, 2000ms, 4000ms
      await sleep(delayMs);
    }
  }
}
```

---

## 📈 Relatórios Consolidados

### Nova Aba: "Relatórios Consolidados"

```
┌──────────────────────────────────────────┐
│ 📊 RELATÓRIOS CONSOLIDADOS DO DIA        │
├──────────────────────────────────────────┤
│                                          │
│ ┌─ DIÁRIO ─────────┐  ┌─ SEMANAL ─────┐ │
│ │ Data: 09/09/2026 │  │ Semana: 36    │ │
│ │ Demanda: 450 vol │  │ Demanda: 3150 │ │
│ │ Realizado: 380   │  │ Realizado: 2800
│ │ Saldo: 70 vol    │  │ Cobertura: 88% │
│ │ Cobertura: 84%   │  │ EPH: 45.2      │
│ │ VPH: 52.3        │  │ 7 dias agg.    │
│ └──────────────────┘  └────────────────┘ │
│                                          │
│ ┌─ MENSAL ────────────────────────────┐ │
│ │ Mês: Setembro 2026                  │ │
│ │ Demanda Total: 12,600 volumes       │ │
│ │ Realizado: 10,800 volumes           │ │
│ │ Saldo Pendente: 1,800               │ │
│ │ Endereços Processados: 1,200        │ │
│ │ Cobertura Global: 85.7%             │ │
│ │ Produtividade: 48.5 VPH             │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ✨ Novo Fluxo Unificado:                 │
│ Relatórios calculados UMA VEZ a partir  │
│ dos dados consolidados no banco local.   │
│ Sem redundância entre abas.              │
└──────────────────────────────────────────┘
```

### Payload Enviado ao Sheets

```json
{
  "tipo": "SYNC_BATCH_CONSOLIDATED_REPRO",
  "timestamp": 1694204400000,
  
  "relatorio_diario": {
    "data": "09/09/2026",
    "dia": "Quarta-feira",
    "tipo": "diário",
    "totalDemanda": 450,
    "totalRealizado": 380,
    "totalEnderecos": 125,
    "totalHoras": 7.25,
    "ephGlobal": "17.2",
    "vphGlobal": "52.4",
    "coberturaGlobal": 84.4,
    "saldoPendente": 70,
    "ruasAtendidas": 12,
    "totalRuas": 14,
    "detalhePorRua": [
      {
        "rua": "B4VD",
        "setor": "87",
        "demanda": 150,
        "realizado": 145,
        "cobertura": 96.7,
        "status": "EXCEDENTE"
      },
      // ... mais ruas
    ],
    "timestamp": 1694204400000
  },
  
  "relatorio_semanal": {
    "semana": 36,
    "ano": 2026,
    "dataInicio": "07/09/2026",
    "dataFim": "09/09/2026",
    // ... dados agregados de 3 dias
  },
  
  "relatorio_mensal": {
    "mes": 9,
    "ano": 2026,
    "dataInicio": "01/09/2026",
    "dataFim": "09/09/2026",
    // ... dados agregados de 9 dias
  },
  
  "eventos_pendentes": [
    {
      "id": "evt_123456",
      "tipo": "REABASTECIMENTO",
      "setor": "87",
      "rua": "B4VD",
      "timestamp": 1694201200000,
      "volumesDelta": 50,
      "enderecosDelta": 10,
      "artigo": "123456"
    }
    // ... max 50 eventos
  ],
  
  "total_eventos_pendentes": 143,
  "versao_schema": "2.0"
}
```

---

## 🎨 Otimização UI/UX

### Navegação Condicional

```typescript
// ANTES: Todas as abas sempre visíveis
const navigationTabs = ['Painel', 'Coletor', 'Histórico', 'Gestão', 'Follow-up'];

// DEPOIS: Baseado em isAuthUnlocked
const navigationTabs = useMemo(() => {
  const baseTabs = ['Painel', 'Coletor'];
  if (isAuthUnlocked) {
    baseTabs.push('Histórico', 'Gestão', 'Follow-up');
  }
  return baseTabs;
}, [isAuthUnlocked]);
```

### Menu Dropdown "Contexto de Operação"

```
┌─ HEADER ──────────────────────┐
│ REPRO v2.0  🔓 Autenticado   │
│ [CONTEXTO: 📱 Coletor ▼]      │
│                               │
│ Dropdown Aberto:              │
│ ✓ 📊 Painel                   │
│ → 📱 Coletor                  │
│   📜 Histórico (se auth)      │
│   ⚙️ Gestão (se auth)         │
│   📈 Follow-up (se auth)      │
└───────────────────────────────┘
```

**Benefícios:**
- ✅ 80% menos espaço de navegação
- ✅ Menu limpo para operadores
- ✅ Cronômetro sempre visível
- ✅ Melhor em telas pequenas

### StopwatchPanel Compacto

```
ANTES:
┌─ StopwatchPanel ──────────────┐
│                               │
│  Setor:  [87▼]                │ padding: 24px
│  Rua:    [B4VD]               │ gap: 16px
│  Artigo: [123456]             │
│  Volumes: [50]  Endereços: [10]
│  [✓ Salvar] [⏸ Pausar]        │
│                               │
└───────────────────────────────┘
  Altura: ~180px (com scroll)

DEPOIS:
┌─ StopwatchPanel ──────────────┐
│ Setor: [87▼] Rua: [B4VD]      │ padding: 8px
│ Artigo: [123456] [📋]         │ gap: 8px
│ Vol: [50]  End: [10]          │
│ [✓ Salvar] [⏸ Pausar] [⊗]    │
└───────────────────────────────┘
  Altura: ~108px (SEM scroll)

Redução: 40% altura | 66% padding
```

### DashboardMetrics Minimalista

```
ANTES (Grande):
┌─────────────────────────────────┐
│ Demanda    Realizado   Pendente │
│  450        380         70      │
│ "Vol"      "Vol"       "Vol"   │
│                                 │
│ Cobertura            VPH Global │
│  84.4%               52.4       │
└─────────────────────────────────┘

DEPOIS (Compacto com Ícones):
┌─────┬─────┬─────┬─────┬────────┐
│Dem. │Real.│Pend.│Cob. │Prod.   │
│ 450 │ 380 │ 70  │84%  │52 VPH  │
│ 🎯  │ ✓   │ ⚠   │ 📈  │ ⚡     │
└─────┴─────┴─────┴─────┴────────┘

Redução: Gap 50% | Cards mais compactos
Responsivo: 2 cols mobile → 5 cols desktop
```

---

## 🛠️ Instalação & Setup

### 1. Pré-requisitos

```bash
node -v          # v18+ recomendado
npm -v           # v9+ recomendado
git --version    # v2.40+
```

### 2. Clonar Repositório

```bash
git clone https://github.com/Emershow90/Repro.git
cd Repro
npm install
```

### 3. Variáveis de Ambiente

```bash
# .env.local
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
VITE_GOOGLE_SHEETS_API_KEY=sua-chave-api
```

### 4. Google Apps Script Setup

```javascript
// apps/script/Code.gs
function doGet(e) {
  return HtmlService.createTemplateFromFile('Page')
    .evaluate();
}

function doPost(e) {
  var contents = e.postData.contents;
  var dados = {};
  
  if (contents) {
    try {
      dados = JSON.parse(contents);
      if (dados.record) {
        dados = dados.record;
      }
    } catch(err) {
      dados = e.parameter || {};
    }
  }
  
  var sheet = SpreadsheetApp.getActiveSheet();
  var timestamp = new Date();
  var values = [[
    timestamp,
    dados.tipo || 'SYNC_BATCH',
    dados.relatorio_diario?.totalDemanda || '',
    dados.relatorio_diario?.totalRealizado || '',
    JSON.stringify(dados)
  ]];
  
  sheet.appendValues(values);
  
  return ContentService
    .createTextOutput(JSON.stringify({status: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 5. Deploy

```bash
# Desenvolvimento Local
npm run dev
# Acessa http://localhost:5173

# Build para Produção
npm run build
npm run preview

# Deploy Vercel
vercel --prod
```

### 6. Testar Sincronização

```bash
# 1. Abrir painel de gestão
http://localhost:5173?tab=gestao

# 2. Colar URL do Google Apps Script
https://script.google.com/macros/s/{deploymentId}/exec

# 3. Clicar "Sincronizar Agora"
# Deve exibir: "✨ Sincronização concluída!"

# 4. Verificar Google Sheets
# Deve ter nova linha com dados consolidados
```

---

## 💻 API de Desenvolvimento

### Importar Módulos

```typescript
// Sincronização
import {
  orchestrateSyncToSheets,
  initializeAutoSync,
  stopAutoSync,
  triggerManualSync,
  getLastSyncMetrics,
  handleSupabaseWebhookPayload
} from '@/utils/syncOrchestrator';

// Relatórios
import {
  calculateDailyReport,
  calculateWeeklyReport,
  calculateMonthlyReport,
  generateConsolidatedBatchPayload,
  saveReportsLocally,
  loadCachedReports
} from '@/utils/reportGenerator';

// Persistência
import {
  initDb,
  getLogs,
  getUnsyncedLogs,
  saveLog,
  saveLogsBulk,
  getState,
  saveState,
  getOperationalSyncQueue
} from '@/dbLocal';

// Google Sheets
import {
  postToGoogleSheets,
  postBatchToGoogleSheets,
  fetchFromGoogleSheets,
  normalizeSheetUrl
} from '@/sheetService';
```

### Exemplos de Uso

```typescript
// Exemplo 1: Sincronização Manual
const metrics = await triggerManualSync({
  apiUrl: 'https://script.google.com/...',
  date: '2026-09-09',
  logs: allLogs,
  streetSummaries: summaries,
  demands: demandsMap,
  onProgress: (msg) => console.log(msg)
}, 3);

console.log(`Sincronizado em ${metrics.syncDurationMs}ms`);

// Exemplo 2: Carregar Relatórios do Cache
const cached = await loadCachedReports();
if (cached.daily) {
  console.log(`Cobertura diária: ${cached.daily.coberturaGlobal}%`);
}

// Exemplo 3: Salvar Novo Log
const newLog: Log = {
  id: Date.now(),
  data: '09/09/2026',
  dia: 'Quarta',
  setor: '87',
  rua: 'B4VD',
  volumes: 50,
  enderecos: 10,
  horas: 0.5,
  vph: '100.00',
  atividade: 'Reabastecimento',
  colaborador: 'JOÃO',
  synced: false,
  timestamp: Date.now()
};

await saveLog(newLog);
```

---

## 🐛 Troubleshooting

### Problema: Sincronização não funciona

**Causas Comuns:**

```
1. URL do Google Sheets não configurada
   ✓ Solução: Copiar exatamente de Google Apps Script

2. Google Apps Script deployment expirou
   ✓ Solução: Gerar nova implantação
   
3. Permissões "Qualquer pessoa" não ativas
   ✓ Solução: Deploy > Manage Deployments > Change Executables
   
4. Planilha Google compartilhada incorretamente
   ✓ Solução: Share > Pessoas específicas > Editor
```

### Problema: Dados não aparecem no Sheets

**Verificar:**

```bash
# 1. Logs do Google Apps Script
Google Sheet > Extensions > Apps Script > Executions

# 2. Console do Navegador
F12 > Console > Buscar por "sync error"

# 3. Status do Supabase
Supabase Dashboard > Logs > Webhooks

# 4. IndexedDB Local
F12 > Application > IndexedDB > TerminalReproV5
```

### Problema: Muita latência de sincronização

**Otimizações:**

```typescript
// 1. Usar Server Proxy ao invés de Direct
// API url: https://seu-app.com/api/sheets/proxy

// 2. Reduzir tamanho do payload
// Limitar eventos pendentes a 20 (ao invés de 50)

// 3. Usar Cache de Relatórios
// loadCachedReports() para offline

// 4. Monitorar via telemetry
telemetry.time('SyncOrchestrator', 'orchestrateSyncToSheets', () => {
  // operação
});
```

---

## 🚀 Roadmap Futuro

### v2.1 (Próximo)
- [ ] Implementar menu dropdown "Contexto de Operação"
- [ ] Refatorar DashboardMetrics com grid minimalista
- [ ] Reduzir padding em StopwatchPanel (66%)
- [ ] Testar em coletores Zebra reais

### v2.2
- [ ] Gestos touch para navegação (swipe)
- [ ] Modo offline melhorado (PWA)
- [ ] Notificações push de sync status
- [ ] Histórico de artigos (últimos 10)

### v2.3
- [ ] Dashboard analítico com gráficos
- [ ] Comparativo de produtividade (diário/semanal)
- [ ] Alertas automáticos (demanda não atingida)
- [ ] Integração com WMS externo

### v3.0
- [ ] Mobile app nativo (React Native)
- [ ] Integração com GPS para geolocalização
- [ ] Sincronização bidirecional com ERP
- [ ] API REST pública

---

## 📞 Suporte

**Encontrou um bug?** Abra uma issue no GitHub  
**Sugestões?** Discuta no setor de Discussões  
**Precisa de ajuda?** Entre em contato com o time REPRO

---

## 📄 Licença

```
SPDX-License-Identifier: Apache-2.0

Copyright 2026 REPRO Team

Licensed under the Apache License, Version 2.0...
```

---

## 🙏 Agradecimentos

- Google Sheets API
- Supabase
- React
- Tailwind CSS
- Comunidade de código aberto

---

**Última Atualização:** 09/09/2026  
**Versão Documentação:** 2.0  
**Status:** ✅ Completo e Operacional
