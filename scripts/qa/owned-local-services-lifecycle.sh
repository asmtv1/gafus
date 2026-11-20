#!/usr/bin/env bash
# One disposable localhost PG18 + Redis QA pair. Never uses existing data/ports.
# Used by the dedicated cancel/concurrency acceptance test, not production.
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl postgres redis-server redis-cli python3; do
  command -v "$bin" >/dev/null || { echo "QA_BIN_MISSING:$bin" >&2; exit 2; }
done
umask 077
RUN="$(mktemp -d /tmp/gafus-qa-local-lifecycle.XXXXXXXX)"
[[ "$RUN" == /tmp/gafus-qa-local-lifecycle.* && ! -L "$RUN" ]] || exit 2
PG_STARTED=0
REDIS_PID=''
PORTS=''
export RUN
PORTS="$(python3 - <<'PY'
import socket
sockets=[]
for i in range(2):
    s=socket.socket()
    s.bind(("127.0.0.1",0))
    sockets.append(s)
print(*(s.getsockname()[1] for s in sockets))
for s in sockets: s.close()
PY
)"
read -r PG_PORT REDIS_PORT <<< "$PORTS"
# No credentials, SSH, external DB URL or application env is forwarded to services.
cleanup() {
  prior=$?
  trap - EXIT TERM INT HUP
  set +e
  if [[ "$PG_STARTED" == 1 ]]; then
    pg_ctl -D "$RUN/pg" -m immediate -w stop >/dev/null 2>&1
    [[ $? == 0 ]] || prior=2
  fi
  if [[ -n "$REDIS_PID" ]]; then
    # This PID is the exact child created by this script; never hunt by name.
    if kill -0 "$REDIS_PID" 2>/dev/null; then
      kill -TERM "$REDIS_PID" 2>/dev/null
    fi
    wait "$REDIS_PID" 2>/dev/null
    if kill -0 "$REDIS_PID" 2>/dev/null; then prior=2; fi
  fi
  freed="$(python3 - "$PG_PORT" "$REDIS_PORT" <<'PY'
import socket,sys
ok=True
for arg in sys.argv[1:]:
  sock=socket.socket()
  try: sock.bind(("127.0.0.1",int(arg)))
  except OSError: ok=False
  finally: sock.close()
print("yes" if ok else "no")
PY
)"
  if [[ "$freed" != yes ]]; then prior=2; fi
  if [[ "$RUN" == /tmp/gafus-qa-local-lifecycle.* && -d "$RUN" && ! -L "$RUN" ]]; then
    rm -rf -- "$RUN" || prior=2
  fi
  if [[ "$prior" == 0 ]]; then prior=2; fi # This probe MUST exit via cancellation.
  if [[ "$freed" == yes && ! -e "$RUN" ]]; then
    printf 'QA_OWNED_CLEANED pg=%s redis=%s exit=%s\n' "$PG_PORT" "$REDIS_PORT" "$prior"
  else
    printf 'QA_OWNED_CLEANUP_INCOMPLETE pg=%s redis=%s\n' "$PG_PORT" "$REDIS_PORT" >&2
  fi
  exit "$prior"
}
trap cleanup EXIT
trap 'exit 2' TERM INT HUP
echo "QA_OWNED_ALLOCATED run=$RUN pg=$PG_PORT redis=$REDIS_PORT"
initdb -D "$RUN/pg" -A trust -U qa_local_only --no-instructions > "$RUN/init.log" 2>&1
pg_ctl -D "$RUN/pg" -l "$RUN/pg.log" -o "-h 127.0.0.1 -p $PG_PORT -c timezone=UTC" -w start >/dev/null
PG_STARTED=1
mkdir "$RUN/redis"
redis-server --bind 127.0.0.1 --port "$REDIS_PORT" --save '' --appendonly no \
  --protected-mode yes --dir "$RUN/redis" > "$RUN/redis.log" 2>&1 &
REDIS_PID=$!
for i in $(seq 1 60); do
  if [[ "$(redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null)" == PONG ]]; then break; fi
  if ! kill -0 "$REDIS_PID" 2>/dev/null; then echo REDIS_START_FAILED >&2; exit 2; fi
  sleep 0.1
done
[[ "$(redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null)" == PONG ]] || exit 2
if [[ "$(printenv GAFUS_QA_FAIL_AFTER_START || true)" == 1 ]]; then echo QA_SYNTHETIC_STARTUP_FAILURE >&2; exit 3; fi
printf 'QA_OWNED_READY run=%s pg=%s redis=%s redis_pid=%s\n' "$RUN" "$PG_PORT" "$REDIS_PORT" "$REDIS_PID"
while :; do sleep 0.5; done
