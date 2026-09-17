/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * UI/UX OPTIMIZATION GUIDE
 * Optimized for Zebra Industrial Handhelds (800x480px)
 */

# 📱 Guia de Otimização UI/UX: Coletor Zebra

## 🎯 Objetivo
Transformar a interface desktop em uma experiência tátil, compacta e de alta densidade para coletores industriais (Zebra MC3300/TC52).

---

## 🛠️ Otimizações Implementadas

### 1. Navegação Condicional & Limpeza
- **Visibilidade:** Abas 'Gestão', 'Histórico' e 'Follow-up' ocultadas via `isAuthUnlocked`.
- **Menu Dropdown:** Substituição da barra superior pelo "Contexto de Operação" (Dropdown), liberando ~60px de altura vertical.

### 2. Otimização de Layout Zebra (800x480px)
- **Compact StopwatchPanel:**
  - Redução de padding em 66% (de `p-6` para `p-2`).
  - Fontes ajustadas para 14px (legibilidade em movimento).
  - Remoção de margens desnecessárias.
- **DashboardMetrics Minimalista:**
  - Grid de 2 colunas.
  - Ícones minimalistas (`lucide-react`).
  - Foco apenas em KPIs críticos (Saldo, Pendentes, EPH).

---

## 📊 Tabela Comparativa (Antes/Depois)

| Elemento | Antes | Depois |
| :--- | :--- | :--- |
| **Navbar** | Barra fixa (ocupa espaço) | Dropdown "Contexto" |
| **Stopwatch Form** | Padding alto (rolagem) | Padding 2px (sem rolagem) |
| **KPIs** | Lista longa vertical | Grid 2xN compacto |
| **Menus** | Exibição universal | Condicional (`isAuthUnlocked`) |

---

## ✅ Checklist de Implementação Zebra
- [x] Otimização de Padding/Margin em `StopwatchPanel`.
- [x] Grid 2xN para métricas críticas.
- [x] Navegação por Dropdown no `App.tsx`.
- [x] Visibilidade condicional de abas.
- [x] Ícones minimalistas para leitura rápida.
