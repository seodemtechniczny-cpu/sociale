#!/usr/bin/env bash
# Uruchamia backend (FastAPI/uvicorn) i frontend (Next.js) w jednym terminalu.
# Ctrl+C zatrzymuje oba procesy.
set -euo pipefail

cd "$(dirname "$0")"

BACKEND_PORT="${BACKEND_PORT:-8002}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

prefix() {
  local color=$1 tag=$2
  while IFS= read -r line; do
    printf '\033[%sm%s\033[0m %s\n' "$color" "$tag" "$line"
  done
}

cleanup() {
  printf '\n\033[33mZatrzymuję serwery...\033[0m\n' >&2
  pkill -P $$ 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

if [ ! -d backend/venv ]; then
  echo "BŁĄD: backend/venv nie istnieje." >&2
  echo "  Uruchom: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "BŁĄD: frontend/node_modules nie istnieje." >&2
  echo "  Uruchom: cd frontend && npm install" >&2
  exit 1
fi

if lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
  echo "BŁĄD: port $BACKEND_PORT zajęty. Zatrzymaj proces lub ustaw BACKEND_PORT=<inny>." >&2
  exit 1
fi
if lsof -ti:"$FRONTEND_PORT" >/dev/null 2>&1; then
  echo "BŁĄD: port $FRONTEND_PORT zajęty. Zatrzymaj proces lub ustaw FRONTEND_PORT=<inny>." >&2
  exit 1
fi

printf '\033[32mSociale dev → backend :%s, frontend :%s (Ctrl+C aby zatrzymać)\033[0m\n' \
  "$BACKEND_PORT" "$FRONTEND_PORT" >&2

(
  cd backend
  # shellcheck disable=SC1091
  source venv/bin/activate
  exec uvicorn app.main:app --reload --port "$BACKEND_PORT" 2>&1
) | prefix "36" "[BE]" &

(
  cd frontend
  exec env NEXT_PUBLIC_API_URL="http://localhost:$BACKEND_PORT" npm run dev 2>&1
) | prefix "35" "[FE]" &

wait
