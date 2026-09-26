# Terminal REPRO v5.0 📦

O **Terminal REPRO** é uma aplicação web progressiva (PWA) de classe industrial, projetada com a arquitetura **Offline-First**. Seu objetivo é operar em coletores de dados (PDTs, como Zebra MC3000/MC3300) no chão de fábrica, garantindo o fluxo contínuo de Reabastecimento e Auditoria de Estoque, mesmo em áreas com sombra de conectividade (Wi-Fi/4G).

## 🧭 Princípios de Engenharia

1. **Offline-First e Tolerância a Falhas:** O operador nunca é bloqueado. Sem rede, os dados são enfileirados no `IndexedDB` e transmitidos automaticamente assim que a conexão é restaurada.
2. **Ergonomia Operacional:** Foco em navegação passo a passo para reduzir a carga cognitiva, botões largos (touch-friendly), e motor de *Web Audio API* para bipes de sucesso e erro diretamente no hardware do coletor.
3. **Integração Híbrida e Segura:** Comunicação com sistemas legados (IBM AS/400 DB2) para leitura, e consolidação de dados de produtividade em nuvem (Google Sheets e Supabase).

---

## 🏗️ Arquitetura do Sistema

### Frontend (Coletores / Torre de Controle)
* **Framework:** React 18+ com TypeScript (Vite).
* **Styling:** Tailwind CSS (Mobile-first, alto contraste e suporte a tema "Fósforo Verde" AS/400).
* **Gerenciamento de Estado:** Zustand.
* **Ícones e Animações:** Lucide React e Framer Motion.
* **Persistência Local:** `IndexedDB` (banco principal offline) e `localStorage` (credenciais e configurações).

### Backend & Cloud (Integração)
* **API Bridge:** Node.js (Express) servindo como ponte segura para ODBC (AS/400) e proxy para Webhooks.
* **Tempo Real:** Supabase (PostgreSQL) com WebSockets (`Supabase Realtime`) para presença e prevenção de colisões.
* **Consolidação/Relatórios:** Webhooks via Google Apps Script apontando para o Google Sheets (`Controle de horas - Repro`).

---

## 🚀 Estado Atual: Fases A1 e A2 (Operacional)

O sistema encontra-se congelado e estável para **Testes de Campo (PoC)** no galpão com as seguintes funcionalidades:

* **Módulo Operacional PDT (Reabastecimento Guiado):** Fluxo step-by-step (Endereço → CTN Pai → CTN Filho → Artigo → Qtd) com validação local baseada em regras importadas por CSV.
* **Fila de Sincronização Automática (Sync Engine):** O `syncStore` checa o `navigator.onLine` a cada 3 segundos. Estando online, realiza o "flush" do IndexedDB para a nuvem.
* **Torre de Gestão (Management Module):** Painel web para supervisores visualizarem logs em tempo real, auditarem ruas e configurarem integrações sem recompilar o código.
* **Mock ODBC:** Simulação do banco IBM AS/400 no frontend para testes de UI e auditoria cruzada.

---

## 🗺️ Roadmap de Arquitetura: Fases A3 e A4 (Aprovado)

As próximas fases trarão robustez de missão crítica ao sistema, substituindo os mocks atuais por soluções de engenharia avançadas:

### Fase A3: Segurança, Cache TTL e Reatividade
1. **Backend Blindado (Zero SQL Injection):** O catálogo de queries SQL (`SQL_CATALOG`) será migrado integralmente para o servidor Node.js. O frontend passará a enviar apenas o `queryId` e os parâmetros. O Backend resolverá o template e executará a consulta.
2. **Cache com Time-To-Live (TTL):** Implementação de expiração rígida de cache (ex: 60 minutos) para dados de estoque vindos do WMS. Previne que operadores tomem decisões baseadas em *Stale Data* (dados obsoletos).
3. **Reatividade Zustand + IndexedDB (`useRuleStore`):** Injeção automatizada dos resultados das queries WMS diretamente na *store* de validação local do PDT, atualizando a interface do operador sem necessidade de *refresh*.

### Fase A4: Colaboração Realtime e KPIs Gerenciais
1. **Prevenção de Colisão (Soft Lock):** Utilização do `useSupabaseRealtime` para monitorar a presença. Se o Operador A tentar bipar um endereço que o Operador B acabou de iniciar, o PDT emitirá um alerta bloqueante suave, permitindo ao Operador A "Assumir o Risco" caso confirme visualmente que o colega não está mais na rua.
2. **Motor de Produtividade (VPH e EPH):** Consolidação matemática cruzando as Horas Diretas (produção), Horas Indiretas (treinamento/reuniões) e os Volumes processados para gerar os KPIs definitivos de **VPH Net** (Volumes por Hora Líquida) e **VPH Bruto**.

---

## 🛠️ Como Executar o Projeto

```bash
# 1. Instalar as dependências
npm install

# 2. Configurar variáveis de ambiente
# Renomeie o arquivo .env.example para .env e preencha as credenciais
cp .env.example .env

# 3. Rodar o servidor de desenvolvimento (Frontend + Backend Bridge)
npm run dev

# 4. Build para Produção
npm run build
npm start
```
