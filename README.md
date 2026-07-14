# Terminal REPRO v5.0 // Manual de Documentação do Sistema

O **Terminal REPRO v5.0** é uma consola de alta performance de nível industrial concebida para a monitorização de produtividade, registo de tempos (cronometragem de atividades diretas e indiretas) e cálculo de **VPH (Volumes por Hora)** no setor da intralogística e operações de armazém.

Este sistema foi arquitetado com base no princípio **Local-First, Cloud-Synced**, garantindo resiliência operacional absoluta: os operadores podem registar atividades sem interrupções mesmo sob perda total de conectividade, sendo os dados guardados localmente em **IndexedDB** e sincronizados de forma transparente com o banco de dados relacional **PostgreSQL** e **Firebase Authentication** assim que a rede for restabelecida.

---

## 1. Arquitetura Técnica & Stack Tecnológica

O sistema segue um modelo full-stack moderno com desacoplamento cliente-servidor:

```
┌────────────────────────────────────────────────────────┐
│                      Navegador                         │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │   UI (React + Vite)   │──>│ IndexedDB (Local DB) │  │
│  └───────────────────────┘   └──────────────────────┘  │
└───────────────┬────────────────────────────────────────┘
                │ (HTTPS / Bearer JWT)
                ▼
┌────────────────────────────────────────────────────────┐
│                    Servidor Cloud                      │
│  ┌───────────────────────┐   ┌──────────────────────┐  │
│  │   Express API (Node)  │──>│  PostgreSQL Cloud    │  │
│  └────────────┬──────────┘   │     (Drizzle ORM)    │  │
└───────────────┼──────────────└──────────────────────┘  │
                ▼
   ┌─────────────────────────┐
   │ Firebase Auth Validator │
   └─────────────────────────┘
```

*   **Front-End:**
    *   **React 18 + Vite:** Renderização ultra-rápida de componentes e fluxo de estado reativo.
    *   **Tailwind CSS:** Interface customizada num tema escuro com aspeto de terminal industrial (Alta legibilidade, alto contraste e elementos visuais minimalistas).
    *   **Framer Motion (`motion/react`):** Micro-animações fluidas e transições de painéis.
    *   **Recharts / D3:** Dashboards de análise visual para KPIs de produtividade e curvas de VPH.
    *   **Lucide React:** Ícones estilizados consistentes.
*   **Back-End:**
    *   **Node.js & Express:** Servidor REST API robusto e leve.
    *   **TypeScript (tsx):** Execução segura com tipagem estática no ambiente de desenvolvimento.
    *   **esbuild:** Bundler de produção compilando o backend para um ficheiro único `dist/server.cjs` (evitando problemas de resolução de caminhos em ESM e melhorando o tempo de arranque do contentor).
*   **Armazenamento de Dados & Persistência:**
    *   **Local (IndexedDB):** Repositório local gerido por `dbLocal.ts` para persistência no navegador, eliminando perda de dados por encerramento de abas ou perda de energia.
    *   **Nuvem (PostgreSQL):** Banco de dados relacional que consolida todos os registos operacionais da equipa, ligando registos ao utilizador autenticado por `userId`.
    *   **Drizzle ORM:** TypeScript ORM moderno para gerir esquemas de tabelas e realizar queries seguras.
*   **Segurança e Autenticação:**
    *   **Firebase Authentication:** Sistema robusto de Login Único (SSO) com Google Sign-In integrado.
    *   **Middleware de Autenticação (`requireAuth`):** Validação de tokens JWT (`Bearer`) no Express, garantindo que nenhum dado no PostgreSQL possa ser lido ou alterado sem as devidas permissões.

---

## 2. Estrutura do Repositório

```
├── .env.example              # Exemplo de configuração de variáveis de ambiente
├── metadata.json             # Metadados e permissões da aplicação no AI Studio
├── package.json              # Gestor de dependências e scripts do sistema
├── server.ts                 # Ponto de entrada do servidor Express API
├── tsconfig.json             # Configuração do TypeScript
├── vite.config.ts            # Configuração do Vite (HMR desativado para estabilidade)
├── src/
│   ├── App.tsx               # Componente principal do cliente e orquestrador de estado
│   ├── dbLocal.ts            # Motor de base de dados local (IndexedDB)
│   ├── eventBus.ts           # Canal de comunicação de eventos globais de atividades
│   ├── index.css             # Estilos globais e definições de variáveis do Terminal
│   ├── sheetService.ts       # Serviço de integração de backup para Google Sheets
│   ├── types.ts              # Definições globais de interfaces TypeScript
│   ├── components/           # Componentes modulares da interface
│   │   ├── DashboardMetrics.tsx   # Painel superior com KPIs (VPH Médio, Total de Peças, etc.)
│   │   ├── StopwatchPanel.tsx     # Cronómetros para atividades diretas e indiretas
│   │   ├── HistoryTab.tsx         # Tabela de registos, painel de importação/exportação e filtros
│   │   ├── VphChart.tsx           # Gráfico cartesiano de produtividade horária
│   │   ├── RankingTable.tsx       # Tabela de performance dos melhores operadores
│   │   ├── RecentLogsTable.tsx    # Feed em tempo real dos últimos registos de produção
│   │   ├── WeeklyFollowupTab.tsx  # Relatório estruturado de desempenho por semanas
│   │   ├── AppsScriptHelper.tsx   # Painel auxiliar para configuração de integração do Google Sheets
│   │   └── Screensaver.tsx        # Screensaver de inatividade operacional para proteção do monitor
│   ├── db/                   # Configurações de base de dados (Drizzle & PostgreSQL)
│   │   ├── index.ts               # Inicializador de ligação do Drizzle
│   │   ├── schema.ts              # Esquema relacional de tabelas de utilizadores e registos
│   │   └── users.ts               # Funções de gestão e sincronização de utilizadores no PostgreSQL
│   ├── lib/                  # Bibliotecas e SDKs de terceiros
│   │   ├── firebase.ts            # Configuração do Firebase Client (Auth)
│   │   └── firebase-admin.ts      # Inicialização do SDK Admin do Firebase para validação de JWT
│   └── middleware/
│       └── auth.ts                # Middleware Express de validação e extração de tokens Bearer
```

---

## 3. Resiliência Operacional & Ciclo de Sincronização

O Terminal REPRO foi projetado especificamente para ambientes industriais instáveis. O ciclo de vida dos dados segue os seguintes passos:

1.  **Registo Inicial:**
    *   O operador finaliza uma atividade direta ou indireta usando os cronómetros da interface ou introduz um registo direto.
    *   O registo é gravado imediatamente no **IndexedDB** local com a tag `synced: false`.
2.  **Sincronização em Tempo Real (Se Online):**
    *   O sistema verifica a existência de uma sessão ativa com o Google e conectividade de rede.
    *   Faz um pedido HTTP POST para `/api/records/sync`.
    *   Se a resposta for positiva, atualiza o registo local no IndexedDB para `synced: true` e emite um alerta sonoro/visual de sincronização.
3.  **Ciclo de Background Periódico (A cada 25 segundos):**
    *   Um processo recorrente em segundo plano analisa o IndexedDB em busca de quaisquer registos acumulados com `synced: false`.
    *   Agrupa os registos pendentes e efetua uma sincronização em lote (bulk sync) com a base de dados PostgreSQL.
4.  **Fallback Alternativo (Google Sheets):**
    *   Para flexibilidade total das equipas de gestão, o sistema dispõe de uma funcionalidade opcional de sincronização direta com folhas de cálculo Google (via API / Apps Script Web App), enviando filas de dados em paralelo ao carregar no botão manual.

---

## 4. Importação Inteligente de Planilhas (Excel / CSV)

O processo de importação de ficheiros de dados no painel do Histórico resolve os problemas comuns de interpretação de formatos de dados oriundos de exportações de ERPs e Excel:

### Diagnóstico do Problema de Data Resolvido:
No Excel, as datas são guardadas internamente como **números de série** (o número de dias decorridos desde 30 de dezembro de 1899). Por exemplo, a data `07/01/2026` é armazenada como o número `46029`. Se um importador tentar ler este valor simplesmente convertendo-o para uma data com formatos comuns, ou interpretando-o incorretamente, poderá resultar em anos fictícios como `01/01/46029` (uma concatenação de dia/mês com o número de série bruto).

### Solução Proposta Implementada:
O motor de importação do Terminal REPRO realiza as seguintes conversões automáticas:
1.  **Leitura Ativa do Excel (`cellDates: true`):** A leitura do ficheiro recorrendo ao utilitário `xlsx` extrai diretamente as datas já resolvidas como objetos nativos de Date.
2.  **Cálculo do Número de Série do Excel:** Se o valor lido for classificado como numérico (entre `25000` e `100000`), o script calcula a data correta subtraindo o offset do fuso e a época do Excel (25569 dias):
    $$\text{Data} = \text{Date}(\text{Math.round}((\text{Valor} - 25569) \times 86400 \times 1000))$$
3.  **Tratamento de Strings PT-PT / ISO:** Converte e aceita strings sob o padrão `DD/MM/YYYY` e formatos padrão ISO de forma segura.

### Interface Gráfica de Validação:
Antes de aplicar a importação definitiva, o utilizador dispõe de uma tabela de visualização completa que segmenta as linhas em três categorias:
*   **Válidos (Verde):** Registos prontos para gravação com datas, colaboradores e tempos interpretados com êxito. Exibe graficamente o valor da data convertida final e, de forma transparente, o valor bruto original (ex: `07/01/2026` com nota `Original: 46029`) para segurança absoluta do utilizador.
*   **Duplicados (Amarelo):** Registos já existentes no histórico local para evitar redundância.
*   **Inválidos (Vermelho):** Linhas sem informação crucial (ex: sem colaborador ou sem data válida).

---

## 5. Variáveis de Ambiente e Configuração

Para colocar o sistema em funcionamento completo, deve criar e configurar o ficheiro `.env` na raiz do projeto contendo as seguintes variáveis:

```env
# Configuração de Autenticação do Firebase (Client-side)
VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id

# Configuração de Autenticação do Firebase Admin (Server-side)
FIREBASE_PROJECT_ID=seu_projeto
FIREBASE_CLIENT_EMAIL=seu_client_email@gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nsua_chave_privada\n-----END PRIVATE KEY-----"

# Ligação à Base de Dados PostgreSQL
DATABASE_URL=postgres://utilizador:palavra_passe@servidor:5432/base_dados
```

---

## 6. Comandos e Execução

Os comandos abaixo controlam o ciclo de desenvolvimento e colocação em produção:

```bash
# 1. Instalação de dependências do projeto
npm install

# 2. Executar o servidor em ambiente de desenvolvimento (com tsx e Vite middleware)
npm run dev

# 3. Compilação de ficheiros estáticos (Vite) e empacotamento do servidor Express (esbuild)
npm run build

# 4. Iniciar o terminal REPRO em produção
npm start
```

---

## 7. Licença e Garantia Operacional

Este software foi desenhado e otimizado com foco na velocidade de registo em ecrãs táteis de terminais industriais. Para garantir o melhor desempenho:
1.  Mantenha uma sessão ativa de utilizador com o Google para assegurar que as tabelas de VPH e Ranking contêm dados representativos de toda a operação de intralogística.
2.  As exportações de dados em formato `.xlsx` geradas pelo Terminal REPRO utilizam os cabeçalhos nativos aceites pelo próprio leitor, permitindo transferir e restaurar backups entre terminais de armazém de forma extremamente flexível.
