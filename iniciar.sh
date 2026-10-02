#!/usr/bin/env bash
# Constrói (uma vez) e liga o corpo.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
IMAGEM="${IMAGEM:-outro-corpo}"; CONTAINER="${CONTAINER:-outro}"; REDE="${REDE:-bridge}"

if ! docker image inspect "$IMAGEM:base" >/dev/null 2>&1; then
  echo "construindo o corpo..."
  docker build -t "$IMAGEM:base" corpo
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" >/dev/null
  echo "o corpo já existia e foi ligado."
else
  docker run -d --name "$CONTAINER" --hostname outro --network "$REDE" \
    --memory 512m --cpus 1 --pids-limit 256 --restart unless-stopped \
    "$IMAGEM:base" >/dev/null
  echo "corpo criado."
fi
echo "agora rode: node mente.mjs"
