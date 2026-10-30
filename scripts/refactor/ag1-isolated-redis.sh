#!/bin/zsh
# Start or verify a private, nonpersistent Redis for local Hono only.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
BASE="$ROOT/.local-pg-scratch"
DIR="$BASE/redis-hono-20261024"
CLI=/opt/homebrew/bin/redis-cli
SERVER=/opt/homebrew/bin/redis-server
fail() { print -r -- "ISOLATED_REDIS_DENIED:$1" >&2; exit 24; }
[[ "${PWD:A}" == "$ROOT" ]] || fail cwd
[[ "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" ]] || fail git_root
[[ "$(git -C "$ROOT" branch --show-current)" == vite ]] || fail branch
[[ -d "$BASE" && ! -L "$BASE" && "${BASE:A}" == "$BASE" ]] || fail scratch_root
[[ -x "$CLI" && -x "$SERVER" ]] || fail redis_missing
case "${1:-}" in --start|--status) ;; *) print -r -- 'Usage: scripts/refactor/ag1-isolated-redis.sh --start|--status' >&2; exit 2;; esac
if [[ ! -d "$DIR" ]]; then
  [[ "$1" == --start && ! -e "$DIR" ]] || fail directory_missing
  /bin/mkdir -m 700 "$DIR" || fail cannot_create_dir
fi
[[ ! -L "$DIR" && "${DIR:A}" == "$DIR" ]] || fail redis_path
redis() { "$CLI" -h 127.0.0.1 -p 55927 --raw "$@"; }
if [[ "$(redis PING 2>/dev/null)" != PONG ]]; then
  [[ "$1" == --start ]] || fail not_running
  if /usr/sbin/lsof -nP -iTCP:55927 -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -q LISTEN; then fail occupied; fi
  "$SERVER" --daemonize yes --bind 127.0.0.1 --port 55927 \
    --protected-mode yes --save '' --appendonly no --databases 16 \
    --maxmemory 256mb --maxmemory-policy noeviction \
    --dir "$DIR" --logfile "$DIR/redis.log" --pidfile "$DIR/redis.pid" || fail startup
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [[ "$(redis PING 2>/dev/null)" == PONG ]] && break
    /bin/sleep 0.2
  done
fi
[[ "$(redis PING 2>/dev/null)" == PONG ]] || fail not_ready
[[ "$(redis CONFIG GET dir | /usr/bin/tail -1)" == "$DIR" ]] || fail wrong_instance
[[ "$(redis CONFIG GET bind | /usr/bin/tail -1)" == 127.0.0.1 ]] || fail wrong_bind
[[ "$(redis CONFIG GET protected-mode | /usr/bin/tail -1)" == yes ]] || fail unprotected
[[ "$(redis CONFIG GET appendonly | /usr/bin/tail -1)" == no ]] || fail aof_enabled
[[ "$(redis CONFIG GET save | /usr/bin/tail -1)" == '' ]] || fail rdb_enabled
print -r -- 'ISOLATED_REDIS_OK 127.0.0.1:55927/1 nonpersistent project-owned'
