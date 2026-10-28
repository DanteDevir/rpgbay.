#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env.example .env; fi
set -a
source .env
set +a
if [ ! -d node_modules ]; then npm ci; fi
docker compose -f compose.dev.yaml up -d --wait
npm run db:migrate
npm run db:seed
npm run start:api &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT
npm run dev
