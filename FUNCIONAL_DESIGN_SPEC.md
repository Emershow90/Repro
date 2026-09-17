/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * FUNCIONAL & DESIGN SPEC
 * Módulos: Cronômetro e Reabastecimento
 */

# 📄 Especificação Funcional & Design: Cronômetro e Reabastecimento

Este documento detalha o comportamento funcional e as diretrizes de design para os módulos críticos de cronometragem e fluxo de reabastecimento.

---

## ⏱️ 1. Módulo: Cronômetro (StopwatchPanel)

### Funcionalidade
- **Objetivo:** Rastreamento preciso de tempo de execução operacional.
- **Operação:**
  - `START`: Inicia a contagem baseada no `performance.now()` para alta precisão.
  - `STOP`: Interrompe e registra o tempo final (delta).
  - `RESET`: Reseta o estado para zero.
  - **Persistência:** O tempo decorrido não é perdido em caso de recarga da página (via `localStorage`).

### Design (Otimizado Zebra - 800x480px)
- **Container:** `p-2` (compacto).
- **Tipografia:** Monospaced (para evitar saltos numéricos durante a contagem).
- **Feedback:** Botões de alta área de clique (mínimo 44px) com feedback visual claro (hover/active state).

---

## 📦 2. Módulo: Fluxo de Reabastecimento

O fluxo é dividido em duas etapas operacionais principais:

### 🚀 Reabastecimento 1: Identificação e Solicitação
- **Objetivo:** Iniciar o ciclo de reabastecimento via leitura de endereço/produto.
- **Funcionalidade:**
  - Entrada de dados via leitor de código de barras.
  - Validação imediata de existência do endereço.
  - Criação de evento `LOG_OPERACIONAL` com status `PENDENTE`.
- **Design:** Input field grande focado automaticamente ao abrir a aba.

### 🚀 Reabastecimento 2: Execução e Conclusão
- **Objetivo:** Confirmação da movimentação e baixa no inventário.
- **Funcionalidade:**
  - Leitura de confirmação (produto retirado).
  - Atualização do status para `CONCLUÍDO`.
  - Disparo de `syncOrchestrator` para atualização em tempo real (Supabase → Google Sheets).
- **Design:** Indicador visual de progresso (barra de status) para confirmar que o reabastecimento foi registrado.

---

## 🎨 Diretrizes Gerais de Design
- **Foco:** Operação sem necessidade de scroll (`h-screen overflow-hidden`).
- **Contraste:** Uso de cores neutras com alertas funcionais (verde para sucesso, laranja para atenção).
- **Mobile-First:** Todos os componentes respeitam a proporção da tela industrial do coletor Zebra.
