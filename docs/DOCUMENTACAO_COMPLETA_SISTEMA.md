# TERMINAL REPRO v5.0 // DOCUMENTAÇÃO TÉCNICA E OPERACIONAL COMPLETA

---

## 1. VISÃO GERAL DO SISTEMA

O **Terminal REPRO v5.0** é uma plataforma de alta performance e padrão industrial desenvolvida sob medida para a gestão intralogística, cronometragem operacional de alta precisão, apontamento de reabastecimento por rua e cálculo automatizado de indicadores de produtividade (**VPH - Volumes Por Hora** e **EPH - Endereços Por Hora**).

Projetado especificamente para operar em ambientes industriais exigentes (bancadas de separação, paleteiras, empilhadeiras e coletores de dados Zebra/Android/iOS), o sistema adota a arquitetura **Local-First, Cloud-Synced**. Isso assegura que nenhuma informação seja perdida por oscilações ou quedas totais de conectividade Wi-Fi/4G no armazém.

---

## 2. ARQUITETURA TÉCNICA & ENGENHARIA DE SOFTWARE

### 2.1. Princípios Arquiteturais
- **Local-First Resilient:** Todas as transações operacionais são gravadas instantaneamente no banco de dados local **IndexedDB** do navegador antes de qualquer tentativa de transmissão via rede.
- **Circuit Breaker & Exponential Backoff:** As requisições de sincronização com nuvem (Google Sheets e Supabase) são protegidas por disjuntor de circuito que evita sobrecarga e gerencia filas de repetição (*retries*).
- **Clean Architecture & Zustand Store:** Separação estrita entre a camada de apresentação visual, as regras de negócios matemáticas e os repositórios de dados.
- **Audio Feedback Engine (Web Audio API):** Síntese sonora de baixa latência nativa para confirmação de bipes e apontamentos em coletores móveis.

### 2.2. Diagrama de Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TERMINAL / COLETOR                                │
│                                                                             │
│   ┌───────────────────────────┐           ┌─────────────────────────────┐   │
│   │    Interface Operacional  │ ◄───────► │    Zustand Stores           │   │
│   │    (React 19 + Tailwind)  │           │    (ui, sector, collab, hist)   │
│   └─────────────┬─────────────┘           └──────────────┬──────────────┘   │
│                 │                                        │                  │
│                 ▼                                        ▼                  │
│   ┌───────────────────────────┐           ┌─────────────────────────────┐   │
│   │   Motor de Áudio (PDT)    │           │    IndexedDB Local Engine   │   │
│   │   (Web Audio API)         │           │    (dbLocal.ts)             │   │
│   └───────────────────────────┘           └──────────────┬──────────────┘   │
└──────────────────────────────────────────────────────────┼──────────────────┘
                                                           │
                                   ┌───────────────────────┴───────────────────────┐
                                   │           Fila de Sincronização               │
                                   │           (Circuit Breaker + Retries)         │
                                   └───────────────┬───────────────────────────────┘
                                                   │
                          ┌────────────────────────┴────────────────────────┐
                          ▼                                                 ▼
            ┌───────────────────────────┐                     ┌───────────────────────────┐
            │   Google Apps Script      │                     │   Supabase Cloud DB       │
            │   (Google Sheets API)     │                     │   (PostgreSQL / RLS)      │
            │   Aba: Controle de horas  │                     │   Tabela: repro_logs      │
            └───────────────────────────┘                     └───────────────────────────┘
```

### 2.3. Stack Tecnológica
| Camada | Tecnologia | Propósito / Benefício |
| :--- | :--- | :--- |
| **Framework Web** | React 19 + Vite | Renderização ultra-rápida e compilação otimizada para navegadores embarcados. |
| **Linguagem** | TypeScript 5+ | Tipagem estrita de todos os eventos, logs, parâmetros setoriais e cálculos. |
| **Estilização & UI** | Tailwind CSS v4 | Tema escuro industrial (*OLED-Friendly*), alto contraste e botões ampliados para toque. |
| **Estado Global** | Zustand | Gerenciamento de estado leve, desacoplado e de alta performance. |
| **Banco Local** | IndexedDB Nativo | Persistência assíncrona tolerante a falhas de energia e reinicializações de abas. |
| **Gráficos & KPIs** | Recharts + D3.js | Curvas de VPH cartesiano, histogramas e distribuição temporal. |
| **Exportação** | SheetJS (XLSX) + Canvas | Geração nativa de planilhas Excel e relatórios de encerramento em imagem PNG. |
| **Nuvem & Auth** | Google Apps Script + Supabase | Armazenamento corporativo em Google Sheets e banco relacional PostgreSQL. |

---

## 3. MÓDULOS DO SISTEMA

### 3.1. Painel Operacional de Cronometragem (`StopwatchPanel.tsx`)
O coração do apontamento diário de produtividade.
- **Seleção de Setor:** Permite alternar entre **Setor 87**, **Setor 88**, **Setor 89** e **Setor 90**.
- **Atividades Diretas (Produção):**
  - `REPRO`: Atividade principal de reprocessamento e auditoria de caixas.
  - `ELOG`: Processamento logístico de e-commerce e fluxo direto.
  - `DIVERSOS`: Outras atividades produtivas com geração de volume.
- **Atividades Indiretas (Apoio / Paradas):**
  - Treinamentos, Reuniões, Inventário, Organização de Estoque, EID e Missões Setoriais.
- **Cálculo Preditivo de VPH:** Ao encerrar uma atividade direta e digitar os volumes, o sistema exibe instantaneamente a projeção de rendimento (*Volumes/Hora*) antes de gravar o registro.

### 3.2. Módulo de Reabastecimento por Rua (`StreetReplenishmentModule.tsx`)
Módulo especializado para abastecimento físico de gôndolas e porta-paletes:
- **Navegação por Ruas:** Suporte dinâmico para **Ruas 01 a 64**, organizadas por módulos (1 a 4) e níveis verticais (1 a 8).
- **Apontamento Rápido (Zebra / Coletor):** Botões ampliados (`+1 Endereço`, `+5`, `+10`, `+Volume`) com disparador de áudio em frequências de alta distinção sonora (880Hz / 1760Hz).
- **Indicadores Dinâmicos de Rua:**
  - **EPH (Endereços Por Hora):** Velocidade de atendimento de posições de picking.
  - **Média Volume / Endereço:** Densidade de caixas depositadas por posição visitada.
  - **Percentual de Cobertura:** Comparativo contra a meta de demanda estabelecida para a rua.

### 3.3. Torre de Comando & Follow-up Semanal (`WeeklyFollowupTab.tsx`)
Painel analítico para supervisores e encarregados de turno:
- **Consolidação Temporal:** Filtros automáticos por **Semana do Ano (1 a 53)** e **Mês de Competência**.
- **Matriz de Produtividade por Colaborador:** Tabela detalhada cruzando Horas Diretas, Horas Indiretas, Total de Peças/Volumes e VPH Líquido individual.
- **Distribuição Setorial:** Gráficos comparativos de tempo e volume entre os setores 87, 88, 89 e 90.
- **Exportação de Relatório PNG:** Geração de card visual estilizado em alta definição pronto para compartilhamento via e-mail ou WhatsApp corporativo.

### 3.4. Histórico, Auditoria & Importação/Exportação (`HistoryTab.tsx`)
Repositório central de registros com recursos avançados de auditoria:
- **Filtros Temporais Inteligentes:** Seleção rápida para *Hoje*, *Ontem*, *Esta Semana*, *Este Mês* ou *Intervalo Customizado*.
- **Edição e Exclusão Segura:** Correção de lançamentos com justificativa de apontamento.
- **Exportação XLSX:** Exporta todos os dados com os cabeçalhos exatos da operação.
- **Importação com Mapeamento Flexível:** Reconhece colunas com variações de nomenclatura (ex: "Qtd", "Volumes", "Endereços", "Colaborador", "Operador") e valida os tipos de dados linha por linha.

### 3.5. Gestão, Telemetria & Google Sheets (`ManagementModule.tsx` & `AppsScriptHelper.tsx`)
Central de controle técnico e integrações:
- **Configuração da API Google Sheets:** Inserção do Web App URL do Google Apps Script com teste de conexão bidirecional (*Ping/Health Check*).
- **Código Apps Script Embutido:** Fornece o script `doPost` e `doGet` pronto para copiar e colar no editor do Google Apps Script com proteção de cabeçalhos e CORS.
- **Monitor de Fila de Retenção:** Visualização de itens pendentes de sincronização quando em modo offline, com acionamento manual de envio em lote (*Flush Queue*).
- **Telemetria de Sistema:** Diagnóstico de memória do navegador, latência de rede e integridade das tabelas IndexedDB.

### 3.6. Descanso de Tela Inteligente (`Screensaver.tsx`)
- **Proteção de Painéis:** Evita queima de fósforo (*burn-in*) em monitores fixos de armazém e economiza bateria em coletores portáteis.
- **Controle Centralizado:** Pode ser ligado/desligado com 1 clique pelo cabeçalho superior ou configurado para tempos de inatividade de 1, 2, 5, 10, 15 ou 30 minutos.
- **Não Interrupção:** O cronômetro e a sessão de trabalho continuam contabilizando normalmente em segundo plano enquanto o descanso está visível.

---

## 4. FORMULAÇÃO MATEMÁTICA E REGRAS DE NEGÓCIO

### 4.1. Conversão de Tempo Decimal ($H$)
O tempo decorrido ($S$, em segundos) é convertido para horas decimais com precisão de duas casas:
$$H = \frac{S}{3600}$$

*Exemplo: 1 hora e 45 minutos = $6300 \text{ segundos} / 3600 = 1.75 \text{ horas}$.*

---

### 4.2. Produtividade Líquida (VPH Net)
Mede a velocidade real de processamento durante o tempo em que o colaborador esteve efetivamente em produção (excluindo paradas, reuniões e treinamentos):

$$\text{VPH}_{\text{Net}} = \begin{cases} \frac{\sum V_{\text{diretos}}}{\sum H_{\text{diretas}}}, & \text{se } \sum H_{\text{diretas}} > 0 \\ 0.00, & \text{se } \sum H_{\text{diretas}} = 0 \end{cases}$$

---

### 4.3. Produtividade Bruta (VPH Geral)
Mede a eficiência global do turno, considerando todo o custo de tempo pago (produção + tempos de apoio):

$$\text{VPH}_{\text{Bruto}} = \frac{\sum V_{\text{totais}}}{H_{\text{diretas}} + H_{\text{indiretas}}}$$

---

### 4.4. Endereços Por Hora (EPH) e Densidade de Rua
Utilizado no módulo de reabastecimento de picking:

$$\text{EPH} = \frac{\text{Total de Endereços Atendidos}}{H_{\text{rua}}}$$

$$\text{Média Volume/Endereço} = \frac{\text{Total de Volumes}}{\text{Total de Endereços}}$$

---

## 5. ESTRUTURA DO BANCO DE DADOS E SINCRONIZAÇÃO

### 5.1. Esquema do Registro Operacional (`Log`)
```typescript
interface Log {
  id: number;                  // Identificador numérico único
  data: string;                // Formato DD/MM/YYYY
  dia: string;                 // Dia da semana por extenso (ex: "Segunda")
  semana: number;              // Semana do ano (1 a 53)
  atividade: string;           // Nome da atividade (ex: "REPRO", "TREINAMENTO")
  colaborador: string;         // Nome do operador em CAIXA ALTA
  volumes: number;             // Quantidade física movimentada (0 para indiretas)
  horas: number;               // Duração em horas decimais (ex: 1.50)
  vph: string;                 // Produtividade calculada formatada (ex: "320.00")
  timestamp: number;           // Unix epoch timestamp em milissegundos
  synced: boolean;             // Status de sincronização com a nuvem
  tipo: 'direta' | 'indireta'; // Classificação contábil da hora
  setor?: string;              // Setor associado ("87", "88", "89", "90")
  rua?: string;                // Rua associada (quando aplicável)
  enderecos?: number;          // Posições visitadas
  eph?: string;                // Endereços/hora
}
```

### 5.2. Mapeamento de Colunas para Google Sheets
Planilha de Destino: **`Controle de horas - Repro`**

| Coluna | Nome do Campo no Sheets | Formato / Tipo | Exemplo |
| :---: | :--- | :--- | :--- |
| **A** | `Setor` | Texto / Inteiro | `87` |
| **B** | `Data` | Data (`DD/MM/YYYY`) | `28/08/2026` |
| **C** | `Semana` | Número do dia (1-7) | `5` |
| **D** | `Semana do Ano` | Número (1-53) | `35` |
| **E** | `O que foi feito no Repro` | Texto | `REPRO` |
| **F** | `Colaborador` | Texto Caixa Alta | `EMERSON GONCALVES` |
| **G** | `QTD endereços` | Numérico Inteiro | `450` |
| **H** | `Horas usadas` | Numérico Decimal | `1.50` |

---

### 5.3. Sincronização Simultânea Multi-Dispositivo (PDT ↔ PC ↔ Planilha Google)

O sistema opera com um motor de **Sincronização Contínua em Segundo Plano** (Auto-Sync a cada 30 segundos, ao reconectar ou ao focar na janela do navegador), permitindo que múltiplos operadores e supervisores trabalhem simultaneamente:

1. **Quando o Operador no Coletor Zebra / PDT** registra ou conclui o Reabastecimento de uma Rua ou uma atividade com cronômetro:
   - O dado é gravado no banco de dados local do coletor (*IndexedDB*).
   - O sistema dispara imediatamente o envio seguro com bloqueio atômico (*LockService*) para a Planilha Google.
2. **Quando o Supervisor ou outro Operador está com o sistema aberto em outro PC, Tablet ou Coletor**:
   - O motor de sincronismo em segundo plano detecta novos apontamentos e efetua o *merge* transparente na base de dados local do outro dispositivo.
   - Os gráficos, tabelas de ranking, cobertura de ruas e o painel de Gestão & Follow-up são atualizados instantaneamente sem interromper o trabalho local.
3. **Mecanismo de Tolerância a Falhas**:
   - Se uma máquina estiver temporariamente sem sinal de Wi-Fi, ela continua operando normalmente em modo *Local-First*. Ao retornar a conexão, a fila envia os registros e recebe os dados consolidados de todas as outras máquinas.

---

## 6. GUIA OPERACIONAL POR PERFIL DE USUÁRIO

### 6.1. Operador de Armazém / Coletor
1. **Iniciar Turno:** Abra o sistema no navegador do coletor ou computador da bancada.
2. **Selecionar Operador e Setor:** Escolha o seu nome na lista e o setor de atuação (87, 88, 89 ou 90).
3. **Iniciar Apontamento:**
   - Para trabalho direto: Clique no botão da atividade (`REPRO`, `ELOG`, `DIV`). O cronômetro iniciará a contagem imediatamente.
   - Para paradas ou tarefas indiretas: Selecione a atividade na lista de indiretas e clique em `INICIAR`.
4. **Pausar / Finalizar:** 
   - Ao terminar o lote, clique em `FINALIZAR`.
   - Digite a **Qtd de Volumes** processados (o VPH previsto será calculado na hora).
   - Clique em `GRAVAR`. O registro é armazenado localmente e entra na fila de envio.

### 6.2. Encarregado / Líder de Operações
1. **Acompanhar Produtividade da Equipe:** Acesse a aba **Follow-up Semanal** para visualizar a média de VPH Net e Bruto por setor e por colaborador.
2. **Auditoria de Horas:** Verifique na aba **Histórico** eventuais discrepâncias de tempo, entradas duplicadas ou atividades sem volume.
3. **Exportar Relatórios:**
   - Para envio à gerência: Gere o card visual em PNG pelo botão `Baixar Relatório PNG`.
   - Para consolidação contábil: Clique em `Exportar XLSX` para obter a planilha com todos os lançamentos do período filtrado.

### 6.3. Administrador de TI & Suporte
1. **Configuração da Planilha Google:**
   - Crie uma planilha no Google Drive com a aba nomeada exatamente como `Controle de horas - Repro`.
   - Vá em *Extensões > Apps Script*, cole o código fornecido em **Gestão & Sheets > Código Apps Script** e faça a implantação como *App da Web* com acesso concedido a *Qualquer Pessoa*.
   - Cole a URL gerada no campo **Configurar Web App URL** do terminal e clique em **Testar Conexão**.
2. **Implantação do Sistema:**
   - O sistema compila estaticamente e pode ser servido via Cloud Run, Docker, GitHub Pages, Vercel ou Nginx interno:
     ```bash
     npm install
     npm run build
     ```
   - Os arquivos estáticos são gerados na pasta `/dist`.

---

## 7. RESOLUÇÃO DE PROBLEMAS (TROUBLESHOOTING)

| Sintoma | Causa Mais Provável | Ação Recomendada |
| :--- | :--- | :--- |
| **Fila Retida com registros pendentes** | Perda temporária de conexão com o Google Sheets ou URL do Apps Script incorreta. | Verifique se a conexão Wi-Fi está ativa. Acesse **Gestão & Sheets**, teste a URL e clique em **Sincronizar Fila**. |
| **Descanso de tela ativando indesejadamente** | Descanso de tela ativado com tempo baixo. | Clique no botão **`Descanso: LIGADO`** no cabeçalho superior para mudar para **`OFF`** ou aumente o tempo em **Gestão & Sheets**. |
| **Erro de CORS no Google Apps Script** | A implantação do Apps Script não foi publicada com acesso para "Qualquer Pessoa". | Abra o Google Apps Script, crie uma *Nova Implantação*, selecione *Quem pode acessar: Qualquer pessoa* e atualize a URL no terminal. |
| **Dados não aparecem após trocar de navegador** | O banco IndexedDB é local por perfil de navegador. | Exporte a base pelo botão **Exportar XLSX** no navegador anterior e utilize **Importar Arquivo** no novo navegador. |

---

*Manual do Terminal REPRO v5.0 — Documento de Engenharia e Operação.*
