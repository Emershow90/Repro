# DOCUMENTAÇÃO TÉCNICA - FOLLOW-UP SEMANAL
## Terminal REPRO // Torre de Comando Operacional

---

### 1. Visão Geral e Arquitetura

O módulo **FOLLOW-UP SEMANAL** é a ferramenta central de gestão de produtividade e análise operacional do Terminal REPRO. O sistema consolida automaticamente os registos operacionais dos **Setores 87, 88, 89 e 90**, permitindo acompanhamento em tempo real, cálculo de indicadores de desempenho (KPIs) e exportação para a planilha corporativa Google Sheets na aba **"Controle de horas - Repro"**.

#### Estrutura de Camadas (Clean Architecture)
```
src/
├── components/          # Camada de Apresentação (UI)
│   ├── StopwatchPanel.tsx        # [3. REGISTO DE ATIVIDADE] com seleção de Setor 87, 88, 89, 90
│   ├── WeeklyFollowupTab.tsx     # Painel do Follow-up Semanal e Relatórios PNG/Canvas
│   ├── HistoryTab.tsx            # Histórico com Importação/Exportação
│   └── AppsScriptHelper.tsx      # Integração Apps Script para a aba "Controle de horas - Repro"
├── hooks/               # Camada de Lógica de Estado / React Custom Hooks
│   └── useFollowup.ts            # Processing de agregações e KPIs do Follow-up
├── services/            # Camada de Regras de Negócio
│   └── followupService.ts        # Fórmulas matemáticas, validação Zod e calculadoras
├── stores/              # Estado Global (Zustand)
│   └── sectorStore.ts            # Gerenciamento dos Setores 87, 88, 89, 90
├── lib/                 # Integrações Externas (Firebase, Supabase)
└── types.ts             # Tipagem TypeScript estrita
```

---

### 2. Especificação do Módulo `[3. REGISTO DE ATIVIDADE]`

O painel de registro de atividade captura as operações diárias dos colaboradores associadas aos setores correspondentes:

1. **Atribuição Setorial:**
   - **Setor 87**: Setor 87 - Repro / Operações
   - **Setor 88**: Setor 88 - Repro / Operações
   - **Setor 89**: Setor 89 - Repro / Operações
   - **Setor 90**: Setor 90 - Repro / Operações

2. **Categorias de Atividades:**
   - **Atividades Diretas (Produção):** REPRO, ELOG, DIVERSOS. Computam volumes e geram produtividade em VPH.
   - **Atividades Indiretas:** Treinamentos, Reuniões, Inventário, Gestão de Estoque, EID, Missões de Setor. Não exigem contagem de volume.

3. **Fluxo de Integração com a Planilha Google:**
   - **Aba de Destino:** `Controle de horas - Repro`
   - **Mapeamento de Colunas:**
     1. `Setor` (87, 88, 89, 90)
     2. `Data` (DD/MM/YYYY)
     3. `Semana` (Número do Dia da Semana)
     4. `Semana do Ano` (1-53)
     5. `O que foi feito no Repro` (Atividade executada)
     6. `Colaborador` (Nome em caixa alta)
     7. `QTD endereços` (Quantidade de volumes/endereços auditados)
     8. `Horas usadas` (Tempo em formato decimal, ex: 3.50)

---

### 3. Funções, Regras de Negócio e Fórmulas Matemáticas

#### 3.1. Cálculo do Tempo Operacional Decimal ($H$)
O cronômetro registra o tempo decorrido em segundos ($S$). A conversão para horas decimais é dada por:
$$H = \frac{S}{3600}$$
*Arredondamento padronizado para 2 casas decimais (ex: 1h 30m = 1.50h).*

#### 3.2. Agregação de Horas Diretas e Indiretas
- **Horas Diretas ($H_{\text{dir}}$):**
  $$H_{\text{dir}} = \sum_{i \in \text{Diretas}} H_i$$
- **Horas Indiretas ($H_{\text{ind}}$):**
  $$H_{\text{ind}} = \sum_{j \in \text{Indiretas}} H_j$$
- **Horas Totais Operacionais ($H_{\text{tot}}$):**
  $$H_{\text{tot}} = H_{\text{dir}} + H_{\text{ind}}$$

#### 3.3. Volume Total de Endereços ($V_{\text{tot}}$)
$$\text{Quantidade de Endereços } (V_{\text{tot}}) = \sum V_i$$
*Apenas lançamentos de tipo direto possuem $V > 0$. Registos indiretos têm $V = 0$.*

#### 3.4. Fórmulas de Produtividade (VPH - Volumes Por Hora)

1. **Produtividade Líquida (VPH Net):**
   $$\text{VPH}_{\text{Net}} = \begin{cases} \frac{V_{\text{tot}}}{H_{\text{dir}}}, & \text{se } H_{\text{dir}} > 0 \\ 0.00, & \text{se } H_{\text{dir}} = 0 \end{cases}$$
   *Regra de Negócio:* Mede a velocidade de execução da equipe unicamente sobre o tempo efetivo de produção em bancada. Exclui o tempo investido em reuniões, formações e inventário.

2. **Produtividade Bruta (VPH Bruto):**
   $$\text{VPH}_{\text{Bruto}} = \begin{cases} \frac{V_{\text{tot}}}{H_{\text{tot}}}, & \text{se } H_{\text{tot}} > 0 \\ 0.00, & \text{se } H_{\text{tot}} = 0 \end{cases}$$
   *Regra de Negócio:* Avalia o rendimento global da operação considerando o custo de tempo total (direto + indireto).

3. **Produtividade Individual por Colaborador:**
   $$\text{VPH}_{\text{Colaborador}} = \frac{\sum V_{\text{colaborador}}}{\sum H_{\text{dir, colaborador}}}$$

4. **Consolidação Semanal e Mensal:**
   - **Acompanhamento Semanal:** Agrupamento por $SemanaDoAno \in [1, 53]$.
   - **Acompanhamento Mensal:** Agrupamento por $Ano-M\hat{e}s$.

---

### 4. Guia de Design System (UI/UX)

#### 4.1. Tipografia
- **Família Monospaced / Terminal:** `Courier New`, `Menlo`, `Consolas`, `monospace`
- **Família Interface / Leitura:** `Plus Jakarta Sans`, `Inter`, `Helvetica`, `sans-serif`

#### 4.2. Escala Tipográfica (Tamanhos de Fonte)
| Elemento | Tamanho (px) | Classe Tailwind | Utilização |
| :--- | :--- | :--- | :--- |
| **Título do Follow-Up** | 24px | `text-2xl` / `text-xl` | Cabeçalho do relatório e cartões de destaque |
| **Valores de Métricas (KPIs)** | 16px - 20px | `text-lg` - `text-xl` | Números principais de volumes, horas e VPH |
| **Títulos de Seção** | 14px | `text-sm` | Rótulos como `[3. REGISTO DE ATIVIDADE]` |
| **Textos de Tabela e Inputs** | 12px | `text-xs` | Células da tabela de histórico e campos de texto |
| **Rótulos Secundários** | 11px | `text-[0.7rem]` | Badges de atividades e identificadores |
| **Eyebrows (Caixa Alta)** | 10px | `text-[0.6rem]` / `text-[0.55rem]` | Subtítulos em tracking largo (`tracking-widest`) |
| **Timestamps / Hashes** | 9px | `text-[0.5rem]` / `text-[0.45rem]` | Notas de rodapé e indicação de sincronização |

#### 4.3. Espaçamento e Rítmo Visual
- **Padding Externo dos Painéis:** `24px` (`p-6`) no desktop; `16px` (`p-4`) no mobile.
- **Espaçamento entre Cards:** `16px` (`gap-4`) a `24px` (`gap-6`).
- **Padding Interno dos Botões:** `12px` horizontal, `8px` vertical (`px-3 py-2` ou `px-4 py-2.5`).
- **Arredondamento de Cantos (Border Radius):** Cantos sutis e industriais limitados a `2px` - `4px` (`rounded-sm`).

#### 4.4. Paleta de Cores
- **Fundo do Terminal:** `#0d0f12` (`bg-terminal-bg`)
- **Painéis de Controle:** `#15181e` (`bg-terminal-panel`)
- **Verde Neon (Produtividade / Sucesso / VPH Net):** `#10b981` (`text-terminal-accent`)
- **Âmbar Warning (Atividades Indiretas / Pendente):** `#f59e0b` (`text-warning`)
- **Azul Cyan (Importações e Links):** `#0ea5e9` (`text-info`)
- **Vermelho (Avisos e Exclusões):** `#ef4444` (`text-danger`)
- **Bordas Tecnológicas:** `rgba(255, 255, 255, 0.12)` (`border-terminal-border/40`)

---
*Documentação gerada automaticamente para o Terminal REPRO v5.0.*
