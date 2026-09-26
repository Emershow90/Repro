#!/usr/bin/env bash
# ============================================================
# validate-audit-module-p0.sh
# Valida os patches P0 aplicados no módulo de auditoria CTN.
# Uso: bash scripts/validate-audit-module-p0.sh
# ============================================================

set -u
FAILED=0

check() {
  local label="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "   ✅ $label"
  else
    echo "   ❌ $label"
    FAILED=1
  fi
}

echo ""
echo "═══════════════════════════════════════════════"
echo "🔴 Validação P0 — Módulo CTN & Endereço"
echo "═══════════════════════════════════════════════"

# ─────────────────────────────────────────────
# D-01: Handlers reais em CtnAuditLogIndexedDbView.tsx
# ─────────────────────────────────────────────
echo ""
echo "▶ D-01: Handlers reais em CtnAuditLogIndexedDbView.tsx"

VIEW_FILE="src/components/CtnAuditLogIndexedDbView.tsx"

check "Arquivo existe" test -f "$VIEW_FILE"
check "handleTriggerSync é async" grep -q "const handleTriggerSync = async" "$VIEW_FILE"
check "handleClearCache é async" grep -q "const handleClearCache = async" "$VIEW_FILE"
check "handleRevalidateItem é async" grep -q "const handleRevalidateItem = async" "$VIEW_FILE"
check "onRefreshRecords integrado" grep -q "onRefreshRecords" "$VIEW_FILE"
check "saveAuditLog importado de dbLocal" grep -q "from '../services/dbLocal'" "$VIEW_FILE"

# ─────────────────────────────────────────────
# A-01: Memory bomb + regex robusta em useArticleAudit.ts
# ─────────────────────────────────────────────
echo ""
echo "▶ A-01: Memory bomb + regex robusta"

HOOK_FILE="src/hooks/useArticleAudit.ts"

check "Arquivo existe" test -f "$HOOK_FILE"
check "MAX_LOTE_RANGE definido" grep -q "MAX_LOTE_RANGE = 5000" "$HOOK_FILE"
check "LOTE_REGEX presente" grep -q "LOTE_REGEX =" "$HOOK_FILE"
check "parseLoteFromObservation pura" grep -q "function parseLoteFromObservation" "$HOOK_FILE"
check "lotesIgnorados exposto" grep -q "lotesIgnorados," "$HOOK_FILE"
check "effectiveEnd presente" grep -q "effectiveEnd" "$HOOK_FILE"

# ─────────────────────────────────────────────
# D-02: Seed controlado em articleAddressService.ts
# ─────────────────────────────────────────────
echo ""
echo "▶ D-02: Seed controlado"

SERVICE_FILE="src/services/articleAddressService.ts"

check "Arquivo existe" test -f "$SERVICE_FILE"
check "SEED_FLAG_KEY definido" grep -q "SEED_FLAG_KEY" "$SERVICE_FILE"
check "hasEverBeenSeeded presente" grep -q "async function hasEverBeenSeeded" "$SERVICE_FILE"
check "markAsSeeded presente" grep -q "async function markAsSeeded" "$SERVICE_FILE"
check "resetSeedFlag exportado" grep -q "export function resetSeedFlag" "$SERVICE_FILE"
check "loadArticleAddressRecords respeita flag" grep -q "alreadySeeded" "$SERVICE_FILE"

# ─────────────────────────────────────────────
# A-02: Deprecação do localStorage espelho
# ─────────────────────────────────────────────
echo ""
echo "▶ A-02: Deprecação de localStorage espelho"

check "syncLocalStorageBackup marcada @deprecated" \
  bash -c "grep -B5 'async function syncLocalStorageBackup' '$SERVICE_FILE' | grep -q '@deprecated'"

check "Sem chamadas ativas a syncLocalStorageBackup" \
  bash -c "[ \$(grep -c 'syncLocalStorageBackup()' '$SERVICE_FILE') -le 1 ]"

check "Sem setItem massivo" \
  bash -c "! grep -q 'localStorage.setItem(.*JSON.stringify' '$SERVICE_FILE'"

check "Sem fallback localStorage em load" \
  bash -c "! grep -A20 'export async function loadArticleAddressRecords' '$SERVICE_FILE' | grep -q 'LOCAL_STORAGE_BACKUP_KEY'"

# ─────────────────────────────────────────────
# Build & Lint
# ─────────────────────────────────────────────
echo ""
echo "▶ Build & Lint"

if command -v npm > /dev/null 2>&1; then
  if npm run lint > /dev/null 2>&1; then
    echo "   ✅ npm run lint"
  else
    echo "   ❌ npm run lint falhou"
    FAILED=1
  fi
else
  echo "   ⚠️  npm não encontrado — pulando lint"
fi

# ─────────────────────────────────────────────
# Resultado Final
# ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
  echo "✅✅✅ FASE P0 COMPLETA — Pronto para merge"
  exit 0
else
  echo "❌❌❌ FASE P0 INCOMPLETA — Corrigir falhas acima"
  exit 1
fi
