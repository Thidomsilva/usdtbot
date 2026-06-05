#!/usr/bin/env bash
set -euo pipefail

# Cron runner for Telegram dispatch hosted on Vercel.
# Usage:
#   DISPATCH_URL="https://usdtbot.vercel.app/api/telegram/dispatch" \
#   CRON_SECRET="your-secret" \
#   ./scripts/cron-telegram-dispatch.sh

DISPATCH_URL="${DISPATCH_URL:-https://usdtbot.vercel.app/api/telegram/dispatch}"
CRON_SECRET="${CRON_SECRET:-}"
SOURCE="${SOURCE:-cron}"

if [[ -z "$CRON_SECRET" ]]; then
  echo "[ERRO] CRON_SECRET nao definido." >&2
  exit 1
fi

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${DISPATCH_URL}?source=${SOURCE}" >/dev/null
