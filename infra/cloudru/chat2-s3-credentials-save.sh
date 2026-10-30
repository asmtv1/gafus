#!/usr/bin/env bash
# Secure manual S3 access-key entry for the NEW Chat2-only Cloud.ru project.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
[[ "$(git -C "$R" rev-parse --show-toplevel)" == "$R" ]] || exit 3
[[ "$(git -C "$R" branch --show-current)" == vite ]] || exit 3
[[ "$(pwd -P)" == "$R" ]] || exit 3
for p in "$R/infra/cloudru" "$R/.local-pg-scratch" "$R/.local-pg-scratch/cloudru";do [[ ! -L "$p" ]] || exit 3;done
C="$R/.local-pg-scratch/cloudru"
TARGET="$C/chat2-s3-credentials.env"
[[ ! -e "$TARGET" && ! -L "$TARGET" ]] || { echo 'Refusing to overwrite existing Chat2 S3 credentials' >&2; exit 3; }
umask 077
TENANT=9d939e53-19e0-43df-b141-9d89b7366ca8
printf 'NEW Cloud.ru Chat2 S3 service-account Key ID: '
IFS= read -r KEY_ID
[[ "$KEY_ID" =~ ^[A-Za-z0-9_-]{28,80}$ ]] || { echo 'Invalid Key ID' >&2; exit 4; }
printf 'NEW Cloud.ru Chat2 S3 Key Secret (hidden): '
IFS= read -rs KEY_SECRET
printf '\n'
[[ "$KEY_SECRET" =~ ^[A-Za-z0-9_-]{28,80}$ ]] || { echo 'Invalid Key Secret' >&2; exit 4; }
( set -C; printf 'CHAT2_S3_ENDPOINT=https://s3.cloud.ru\nCHAT2_S3_BUCKET=gafus-chat2-media-2026\nCHAT2_S3_REGION=ru-central-1\nCHAT2_S3_ACCESS_KEY_ID=%s:%s\nCHAT2_S3_SECRET_ACCESS_KEY=%s\n' "$TENANT" "$KEY_ID" "$KEY_SECRET" > "$TARGET" )
chmod 600 "$TARGET"
unset KEY_SECRET KEY_ID
echo 'New-account S3 credentials saved in ignored Refactor directory (mode 0600); never commit this file.'
