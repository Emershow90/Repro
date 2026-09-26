/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * DOCUMENTAÇÃO MASTER DO SISTEMA REPRO
 */

# 📋 Documentação Master do Sistema REPRO

## 🎯 Visão Geral
Este documento consolida toda a base de conhecimento do sistema REPRO, cobrindo a refatoração do legado e o início da transição para a nova arquitetura "Core" focada em performance industrial.

---

## 🏗️ 1. Arquitetura "Core" (Nova Base - `/src/core`)
Iniciamos a transição para uma arquitetura "Local-First" orientada a eventos para garantir máxima performance nos coletores Zebra.

### Estrutura
- `/src/core/domain/`: Modelagem imutável de dados (`types.ts`).
- `/src/core/infrastructure/`: Camada de persistência (`db.ts` - IndexedDB) e sincronização (`syncOrchestrator.ts`).

### Princípios
- **Local-First:** Os dados são salvos localmente primeiro.
- **Event-Sourcing:** A aplicação registra eventos, não estados finais.
- **Background Sync:** Orquestração de sincronização fora da thread principal.

---

## 🛠️ 2. Refatoração do Legado
Módulos que foram padronizados anteriormente para integrar o sistema operacional:

### Sincronização Centralizada
- Uso de `syncOrchestrator.ts` para reduzir redundância, adicionar *retry logic* (exponential backoff) e telemetria.

### Relatórios Consolidados
- `reportGenerator.ts` unificou cálculos (diários, semanais, mensais) anteriormente dispersos.

### Integração Supabase
- Webhooks configurados para disparar sincronização Google Sheets automaticamente após inserção no Supabase.

---

## 📱 3. Otimização UI/UX (Zebra 800x480px)

### Otimizações Implementadas
- **Navegação Condicional:** Abas administrativas (`isAuthUnlocked`) ocultadas para operadores convidados.
- **Interface Tátil:**
  - `StopwatchPanel`: Redução de 66% no padding.
  - `DashboardMetrics`: Grid compacto 2xN com ícones minimalistas (foco em KPIs críticos).

---

## 🔍 4. Diagnóstico (Técnico e Operacional)

O pilar de diagnóstico garante visibilidade total da saúde da aplicação e da integridade da operação no galpão, eliminando pontos cegos e paradas não programadas.

### 4.1 Diagnóstico Técnico do Sistema
* **Monitor de Conectividade em Tempo Real:**
  * Detecção instantânea de alternância Online/Offline via listeners de rede (`navigator.onLine`).
  * Ping periódico de latência com a API / Supabase para alertar sobre conexões lentas ou instáveis antes de falhas.
* **Saúde da Fila de Sincronização (Outbox Telemetry):**
  * Contador explícito de eventos pendentes na fila local (`IndexedDB`).
  * Alerta visual quando eventos ultrapassarem o limite de tempo sem sincronização (> 5 minutos).
  * Registro de erros com *exponential backoff* para evitar sobrecarga de rede ao restabelecer o sinal.
* **Integridade e Não-Duplicação de Dados:**
  * Uso de UUIDs universais gerados no coletor no instante do clique/bip.
  * Idempotência garantida: mesmo se o pacote for reenviado por oscilação de Wi-Fi, o backend não duplica linhas nem corrompe métricas.

### 4.2 Diagnóstico Operacional e de Produtividade
* **Auditoria de Tempos de Ciclo:**
  * Identificação automática de paradas anormais ou tempos excessivos entre etapas de reabastecimento.
  * Validação de coerência: bloqueio de registros com tempos zerados ou valores negativos de estoque.
* **Indicadores de Status por Rua e Setor:**
  * Visão consolidada em tempo real: quais ruas estão com demanda reprimida versus ruas já auditadas.
  * Cálculo dinâmico de EPH (Endereços por Hora) e VPH (Volumes por Hora) diretamente pelo motor de métricas.

---

## 🎨 5. Design Industrial & Ergonomia (Zebra & Desktop)

O design foi concebido sob a premissa de uso em ambiente fabril/logístico agressivo (coletor Zebra MC3300/TC52, iluminação variável de galpão, uso de luvas e tela com resolução de 800x480px).

### 5.1 Princípios de Ergonomia para Coletores
* **Regra "Zero-Scroll" para Operações Críticas:**
  * Telas de cronômetro e registro de reabastecimento são rigidamente travadas na altura da viewport (`h-screen overflow-hidden`).
  * Todas as ações principais (iniciar, bipar, salvar) ficam acessíveis na metade inferior da tela, ao alcance do polegar do operador.
* **Alvos de Toque Sobredimensionados (Touch Targets):**
  * Botões de ação com altura mínima de 48px a 56px (acima do padrão web comum de 36px) para evitar cliques errados com luvas.
* **Alto Contraste e Legibilidade Instantânea:**
  * Uso de paletas com contraste superior (WCAG AAA) para visualização clara sob luz forte ou corredores escuros de porta-paletes.
  * Tipografia tabular monospaçada (`font-mono`) em contadores e números de código de barras para evitar saltos visuais na tela.
* **Feedback Multissensorial:**
  * Cores de estado inequívocas: Verde esmeralda (Sucesso/Confirmado), Laranja âmbar (Pendente/Atenção), Vermelho rubi (Divergência/Erro).
  * Resposta tátil (vibração da API de haptic feedback) e bipes sonoros diferenciados para leitura correta vs. erro de leitura.

### 5.2 Adaptação Responsiva (Desktop vs. Coletor)
* **Modo Coletor:** Foco em velocidade de entrada, 1 informação por vez, máxima densidade vertical útil.
* **Modo Gestão/Desktop:** Visão expandida em painel amplo com tabelas dinâmicas, filtros rápidos por data/setor e gráficos analíticos.

---

## ⚡ 6. Automações de Ponta a Ponta

A automação do sistema elimina digitação redundante, evita retrabalho humano e conecta o chão de fábrica à gestão sem intermediários.

### 6.1 Automação na Coleta e Bipagem
* **Auto-Focus Contínuo:** O campo de entrada de código de barras / endereço recupera o foco automaticamente após cada leitura, permitindo bipagens consecutivas sem tocar na tela.
* **Reconhecimento Automático de Padrão (Parser de Código):**
  * O sistema identifica automaticamente pelo formato se o que foi bipado é um Endereço, Código de Produto ou Ordem de Separação.
  * Preenchimento automático de campos dependentes (ex: setor, rua e descrição do item carregados da memória local sem requisição manual).

### 6.2 Automação da Transição de Fluxo (Reabastecimento 1 ➔ 2)
* **Passagem Automática de Estado:** Ao finalizar o Reabastecimento 1 (solicitação/demanda), a tarefa é automaticamente enfileirada e disponibilizada na lista do Reabastecimento 2 (execução/auditoria).
* **Cronometragem Embutida Invisível:** O cálculo de tempo decorrido é acionado e parado automaticamente pelos próprios eventos de bipagem, dispensando o operador de gerenciar cronômetros manualmente caso prefira a operação contínua.

### 6.3 Automação de Sincronização e Espelhamento (Supabase & Google Sheets)
* **Background Worker Autônomo:**
  * O operador grava localmente em menos de 2 milissegundos. O motor em segundo plano despacha para a nuvem assim que detecta sinal estável.
* **Webhook & Trigger em Cascata:**
  * Ao ser inserido no Supabase, um gatilho automatizado atualiza a planilha mestre do Google Sheets em tempo real, sem necessidade de exportações manuais em CSV ou planilhas enviadas por e-mail.

---

## 📚 Referências Complementares
- `REFACTORING_DOCUMENTATION.md`: Detalhes técnicos da refatoração de relatórios e sync.
- `UI_UX_OPTIMIZATION_GUIDE.md`: Especificações de design industrial para coletores Zebra.
- `FUNCIONAL_DESIGN_SPEC.md`: Especificação funcional e design para Cronômetro e Reabastecimento.
