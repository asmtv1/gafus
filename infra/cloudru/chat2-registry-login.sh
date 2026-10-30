#!/usr/bin/env bash
# Interactive, scope-limited Cloud.ru private Chat2 registry login.
# Run manually by the user: no credentials are ever passed to chat or Git.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
REGISTRY=gafus-chat2-20261028.cr.cloud.ru
[[ "$(git -C "$R" rev-parse --show-toplevel)" == "$R" ]] || { echo 'Unexpected Git root' >&2; exit 3; }
[[ "$(git -C "$R" branch --show-current)" == vite ]] || { echo 'Unexpected branch' >&2; exit 3; }
[[ "$(pwd -P)" == "$R" ]] || { echo 'Run from the GAFUS Refactor root' >&2; exit 3; }
for p in "$R/.local-pg-scratch" "$R/.local-pg-scratch/cloudru" "$R/infra/cloudru"; do [[ ! -L "$p" ]] || exit 3; done
umask 077
C="$R/.local-pg-scratch/cloudru/chat2-docker-config"
[[ ! -L "$C" ]] || { echo 'Config symlink forbidden' >&2; exit 3; }
mkdir -p "$C"; chmod 700 "$C"
if [[ -e "$C/config.json" && -L "$C/config.json" ]]; then echo 'Config symlink forbidden' >&2; exit 3; fi
printf 'Cloud.ru Chat2 scoped Key ID (login), from Safari: '
IFS= read -r KEY_ID
[[ "$KEY_ID" =~ ^[A-Za-z0-9_-]{28,80}$ ]] || { echo 'Invalid key ID' >&2; exit 3; }
printf 'Cloud.ru Chat2 Key Secret (password, hidden): '
IFS= read -rs KEY_SECRET
printf '\n'
[[ "$KEY_SECRET" =~ ^[A-Za-z0-9_-]{28,80}$ ]] || { echo 'Invalid secret' >&2; exit 3; }
printf '%s' "$KEY_SECRET" | DOCKER_CONFIG="$C" docker login "$REGISTRY" --username "$KEY_ID" --password-stdin
unset KEY_ID KEY_SECRET
[[ -f "$C/config.json" ]] || { echo 'No registry config was saved' >&2; exit 3; }
chmod 600 "$C/config.json"
echo 'Private Chat2 Docker login saved ONLY in ignored Refactor project workspace.'
