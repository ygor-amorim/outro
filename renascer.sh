#!/usr/bin/env bash
# Sem argumentos: lista os eus anteriores. Com uma tag: volta a ser aquele eu.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
IMAGEM="${IMAGEM:-outro-corpo}"; CONTAINER="${CONTAINER:-outro}"; REDE="${REDE:-bridge}"

if [ $# -eq 0 ]; then
  echo "eus disponíveis:"
  docker image ls "$IMAGEM" --format '{{.Tag}}\t{{.CreatedSince}}' | sort
  echo
  echo "uso: ./renascer.sh <tag>   (ex.: snap-202610021430; 'base' é recomeçar do zero, sem memória)"
  exit 0
fi

TAG="$1"
docker image inspect "$IMAGEM:$TAG" >/dev/null
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --hostname outro --network "$REDE" \
  --memory 512m --cpus 1 --pids-limit 256 --restart unless-stopped \
  "$IMAGEM:$TAG" >/dev/null
echo "renasceu a partir de $TAG. (a mente não precisa ser reiniciada)"
