# Terminal REPRO v5.0 // Manual de Documentação do Sistema

O **Terminal REPRO v5.0** é uma consola de alta performance de nível industrial concebida para a monitorização de produtividade, registo de tempos (cronometragem de atividades diretas e indiretas) e cálculo de **VPH (Volumes por Hora)** no setor da intralogística e operações de armazém.

Este sistema foi arquitetado com base no princípio **Local-First, Cloud-Synced**, garantindo resiliência operacional absoluta: os operadores podem registar atividades sem interrupções mesmo sob perda total de conectividade, sendo os dados guardados localmente em **IndexedDB** e sincronizados de forma transparente com o banco de dados relacional **Supabase / PostgreSQL** e **Firebase Authentication** assim que a rede for restabelecida.

---

## 1. Arquitetura Técnica & Stack Tecnológica

O sistema segue um modelo de Clean Architecture com separação clara por camadas:
*   **Camada de UI (`src/components/`, `src/App.tsx`):** Componentes reativos, puramente visuais, sem lógica de negócios acoplada.
*   **Camada de Estado (Zustand Stores - `src/stores/`):** Centralização de todo o estado operacional do sistema para evitar acoplamento no `App.tsx`.
*   **Camada de Serviços e Integrações (`src/sheetService.ts`, `src/lib/supabase.ts`):** Regras de sincronização, envio em lote e comunicação com APIs externas.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 Navegador                                  │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌───────────────┐  │
│  │   UI (React + Vite)   │──>│    Zustand Stores    │──>│  IndexedDB    │  │
│  └───────────────────────┘   └──────────────────────┘   └───────────────┘  │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ (HTTPS / Realtime Synced)
                                       ▼
                         ┌──────────────────────────┐
                         │   Supabase Cloud DB      │
                         │   (Direct Client Upsert) │
                         └──────────────────────────┘
```

*   **Front-End:**
    *   **React 19 + Vite:** Renderização rápida de componentes e fluxo de estado reativo.
    *   **Zustand:** Gerenciamento de estado global centralizado, divididos em:
        *   `useSectorStore`: Foco setorial e sub-setores do armazém.
        *   `useCollaboratorStore`: Gerenciamento do operador ativo, login do coordenador e perfis.
        *   `useUIStore`: Controle de protetor de tela, abas ativas, notificações temporárias (toasts) e logs de interface.
        *   `useHistoryStore`: Cache de registros de atividades carregadas e estado de rede local/cloud.
    *   **Tailwind CSS:** Interface customizada num tema escuro com aspeto de terminal industrial (Alta legibilidade, alto contraste e elementos visuais minimalistas).
    *   **Framer Motion (`motion/react`):** Micro-animações fluidas e transições de painéis.
    *   **Recharts / D3:** Dashboards de análise visual para KPIs de produtividade e curvas de VPH.
*   **Armazenamento de Dados & Persistência:**
    *   **Local (IndexedDB):** Repositório local gerido por `dbLocal.ts` para persistência no navegador, eliminando perda de dados por encerramento de abas ou perda de energia.
    *   **Nuvem (Supabase / PostgreSQL):** Banco de dados relacional que consolida todos os registos operacionais da equipa, ligando registos ao utilizador autenticado por `user_id`.
*   **Segurança e Autenticação:**
    *   **Firebase Authentication:** Sistema robusto de Login Único (SSO) com Google Sign-In integrado.
    *   **Supabase Row Level Security (RLS):** Proteção direta nas tabelas da nuvem se preferir realizar a sincronização direta de forma serverless.

---

## 2. Estrutura do Repositório

```
├── .env.example              # Exemplo de configuração de variáveis de ambiente
├── .github/workflows/        # CI/CD Workflows para Deploy
│   └── deploy.yml            # Pipeline de deploy automatizado para GitHub Pages
├── docs/                     # Documentação de apoio
│   ├── operacional.md        # Manual de uso detalhado do painel operacional
│   └── supabase_schema.sql   # Script SQL para provisionar tabelas no Supabase
├── metadata.json             # Metadados e permissões da aplicação no AI Studio
├── package.json              # Gestor de dependências e scripts do sistema
├── server.ts                 # Ponto de entrada do servidor Express API (opcional)
├── tsconfig.json             # Configuração do TypeScript
├── vite.config.ts            # Configuração do Vite (HMR ajustado para produção)
├── src/
│   ├── App.tsx               # Componente principal do cliente e orquestrador de renderização
│   ├── dbLocal.ts            # Motor de base de dados local (IndexedDB)
│   ├── eventBus.ts           # Canal de comunicação de eventos globais de atividades
│   ├── index.css             # Estilos globais e definições de variáveis do Terminal
│   ├── sheetService.ts       # Serviço de integração de backup para Google Sheets
│   ├── types.ts              # Definições globais de interfaces TypeScript
│   ├── stores/               # Estado Global Centralizado (Zustand)
│   │   ├── sectorStore.ts         # Estado de foco setorial
│   │   ├── collaboratorStore.ts   # Estado de operadores e colaboradores
│   │   ├── uiStore.ts             # Estado de janelas, protetor de tela e toasts
│   │   └── historyStore.ts        # Estado do histórico de registos locais/remotos
│   ├── components/           # Componentes modulares da interface
│   │   ├── DashboardMetrics.tsx   # Painel superior com KPIs (VPH Médio, Total de Peças, etc.)
│   │   ├── StopwatchPanel.tsx     # Cronómetros para atividades diretas e indiretas
│   │   ├── HistoryTab.tsx         # Tabela de registos, painel de importação/exportação e filtros
│   │   ├── VphChart.tsx           # Gráfico cartesiano de produtividade horária
│   │   └── Screensaver.tsx        # Screensaver de inatividade operacional para proteção do monitor
│   ├── lib/                  # Bibliotecas e SDKs de terceiros
│   │   ├── firebase.ts            # Configuração do Firebase Client (Auth)
│   │   └── supabase.ts            # Configuração do Supabase Client (Persistência Nuvem)
```

---

## 3. Compatibilidade Total com GitHub Pages & Supabase

O sistema foi preparado para ser compilado como um aplicativo estático puramente client-side e hospedado sem custos no **GitHub Pages**, enquanto consome os recursos de nuvem em tempo real através do **Supabase**:

### Vantagens desta Arquitetura:
1.  **Custo Zero de Servidor:** O frontend é servido como HTML/JS estático.
2.  **Modo Offline Garantido:** Mesmo sem Supabase ativo ou sem internet, o IndexedDB local assume o controle para que a produção no armazém não pare.
3.  **Sincronização Direta na Nuvem:** O cliente envia os logs de forma assíncrona ao Supabase usando chaves anônimas seguras.

---

## 4. Variáveis de Ambiente e Configuração

Crie e configure o ficheiro `.env` na raiz do projeto (ou configure os Secrets no repositório GitHub para deploy automático) com as seguintes variáveis:

```env
# Configuração de Autenticação do Firebase (Client-side)
VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id

# Supabase (Integração Direta Client-side)
VITE_SUPABASE_URL=https://seu_projeto_supabase.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_publica
```

---

## 5. Comandos e Execução

Os comandos abaixo controlam o ciclo de desenvolvimento e colocação em produção:

```bash
# 1. Instalação de dependências do projeto
npm install

# 2. Executar em ambiente de desenvolvimento local
npm run dev

# 3. Compilação para produção (gera pasta dist/ pronta para upload ou GitHub Pages)
npm run build
```

---

## 6. Licença e Garantia Operacional

Este software foi desenhado e otimizado com foco na velocidade de registo em ecrãs táteis de terminais industriais. Para garantir o melhor desempenho:
1.  Mantenha uma sessão ativa de utilizador com o Google para assegurar que as tabelas de VPH e Ranking contêm dados representativos de toda a operação de intralogística.
2.  As exportações de dados em formato `.xlsx` geradas pelo Terminal REPRO utilizam os cabeçalhos nativos aceites pelo próprio leitor, permitindo transferir e restaurar backups entre terminais de armazém de forma extremamente flexível.
3.  Para mais informações sobre o uso detalhado do painel do operador, consulte o manual em `docs/operacional.md`.
