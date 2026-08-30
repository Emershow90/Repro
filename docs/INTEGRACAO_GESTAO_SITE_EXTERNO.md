# 📡 Integração da Aba Gestão em Site Externo (Tempo Real / Read-Only)

Este documento detalha como conectar e exibir os dados de **Reabastecimento e Gestão Operacional em tempo real** em qualquer **site externo**, portal corporativo, intranet, SharePoint, WordPress ou televisores de Torre de Controle.

---

## 1. Arquitetura da Solução

O fluxo foi desenhado para manter o galpão/operadores e a gestão sincronizados com **zero risco de sobrescrita de dados acidental**:

```
┌─────────────────────────────────────────────────────────────┐
│                    GALPÃO / COLETORES                       │
│    Operadores apontam caixas e ruas no Terminal REPRO       │
└──────────────────────────────┬──────────────────────────────┘
                               │  (POST / Sincronização)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 NUVEM / BANCO DE DADOS                      │
│      Google Sheets / Apps Script Web App / Supabase         │
└──────────────────────────────┬──────────────────────────────┘
                               │  (GET / Read-Only em Tempo Real)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  SITE EXTERNO / GESTÃO                      │
│   • Exibe Torre de Gestão com Realizado vs Demanda          │
│   • Indicadores EPH / VPH, % Cobertura e Saldo Pendente     │
│   • Atualização automática a cada X segundos                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Método 1: Incorporação Iframe / Painel Standalone (Mais Rápido & Sem Backend)

Se você quer exibir a **Aba Gestão Completa** exatamente como ela é dentro do seu site externo, basta incorporar o iframe em modo `standalone`:

### URL com Parâmetros de Gestão:
```text
https://<seu-dominio-repro>/?view=gestao&standalone=true
```

### Código HTML para o Site Externo:
```html
<!-- Container do Painel de Gestão REPRO em Tempo Real -->
<div style="width: 100%; height: 92vh; min-height: 700px; border-radius: 16px; overflow: hidden; background: #020617; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <iframe
    src="https://<seu-dominio-repro>/?view=gestao&standalone=true"
    title="Torre de Gestão de Reabastecimento REPRO"
    width="100%"
    height="100%"
    style="border: none;"
    allow="clipboard-write; fullscreen"
    loading="lazy">
  </iframe>
</div>
```

### Parâmetros de URL Disponíveis:
| Parâmetro | Valores | Descrição |
| :--- | :--- | :--- |
| `view` ou `tab` | `gestao`, `painel`, `ruas`, `followup` | Abre diretamente a aba desejada. |
| `standalone` | `true` | Oculta cabeçalhos do operador, exibindo apenas o dashboard de gestão. |
| `sector` | `TODOS`, `87`, `88`, `89`, `90` | *(Opcional)* Pré-filtra o setor desejado. |

---

## 3. Método 2: Consumir Dados via API JSON (Para Layout Próprio no Site Externo)

Se o seu site externo já possui seu próprio design e precisa apenas dos **dados brutos em formato JSON** para alimentar seus gráficos e tabelas:

### Endpoint Google Apps Script:
```text
GET https://script.google.com/macros/s/AKfycbwzg8jDY71b5sMc6Q_qMii3YYQrdyKROuPe9l24iyEtke1Zhx9cCEt1R7xhxmtjN5aK2A/exec?action=getGestaoData&data=2026-08-30
```

### Exemplo de Resposta JSON:
```json
{
  "status": "success",
  "dataReferencia": "30/08/2026",
  "totais": {
    "demandaTotal": 2450,
    "realizadoTotal": 1820,
    "saldoPendente": 630,
    "coberturaPercent": 74.3,
    "enderecosAtendidos": 142,
    "ephGlobal": "18.5",
    "vphGlobal": "237.4",
    "ruasAtendidas": 28,
    "totalRuas": 38
  },
  "ruas": [
    {
      "rua": "B4VD",
      "setor": "87",
      "demanda": 120,
      "realizado": 120,
      "pendente": 0,
      "coberturaPercent": 100.0,
      "status": "ATENDIDA",
      "enderecos": 12,
      "eph": "20.1",
      "vph": "201.0"
    },
    {
      "rua": "B5VD",
      "setor": "87",
      "demanda": 90,
      "realizado": 45,
      "pendente": 45,
      "coberturaPercent": 50.0,
      "status": "EM_ANDAMENTO",
      "enderecos": 5,
      "eph": "15.0",
      "vph": "135.0"
    }
  ]
}
```

### Exemplo de Código JavaScript para o Site Externo:
```javascript
async function carregarGestaoTempoReal() {
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwzg8jDY71b5sMc6Q_qMii3YYQrdyKROuPe9l24iyEtke1Zhx9cCEt1R7xhxmtjN5aK2A/exec';
  
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getData&sheet=LOGS_REPRO`);
    const data = await response.json();
    
    console.log('Dados recebidos em tempo real:', data);
    // Atualize seus elementos HTML ou cards de gestão aqui:
    // document.getElementById('total-realizado').innerText = data.totais.realizadoTotal;
  } catch (error) {
    console.error('Erro ao buscar dados de reabastecimento:', error);
  }
}

// Atualiza automaticamente a cada 10 segundos
setInterval(carregarGestaoTempoReal, 10000);
carregarGestaoTempoReal();
```

---

## 4. Método 3: Supabase Cloud (PostgreSQL Realtime)

Se você utiliza o **Supabase** configurado no projeto:
1. No seu site externo, instale o cliente Supabase:
   ```bash
   npm install @supabase/supabase-js
   ```
2. Inicialize o cliente com a chave **ANON (pública / somente leitura)**:
   ```javascript
   import { createClient } from '@supabase/supabase-js';

   const supabase = createClient(
     'https://seu-projeto.supabase.co',
     'sua-anon-key-somente-leitura'
   );

   // Escuta novos apontamentos de reabastecimento em tempo real
   const channel = supabase
     .channel('reabastecimento-live')
     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' }, (payload) => {
       console.log('Novo lote apontado no galpão!', payload.new);
       // Atualiza a tabela de gestão instantaneamente
     })
     .subscribe();
   ```

---

## 5. Segurança e Proteção dos Dados

- **Modo Read-Only (Apenas Leitura):** O site externo não tem permissão para alterar ou apagar logs do operador no galpão.
- **Chave Anônima / Web App Seguro:** O Web App do Google Apps Script executa no modo `Me` (autor do script) e expõe apenas visualização para os parâmetros de leitura (`action=get...`).
- **Resiliência Offline:** Se o site externo perder a conexão temporariamente, ele retenta automaticamente sem travar a interface.
