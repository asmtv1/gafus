#!/bin/zsh
# Complete local acceptance: real GAFUS SDK / collector / Tempo / Grafana /
# durable Tempo volume after container restart. Staging remains unverified.
set -euo pipefail
cd "${0:A:h}/../../.."
compose=(docker compose -f ci-cd/docker/tracing-local/compose.yaml)
evidence="${GAFUS_TRACING_EVIDENCE_DIR:-$HOME/Library/Logs/gafus-refactor-regression/tracing-local-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$evidence"
print -r -- "EVIDENCE_DIR=$evidence"
"${compose[@]}" config > "$evidence/docker-compose-rendered.yaml"
"${compose[@]}" up -d
for i in {1..90}; do
  if curl -fsS --max-time 2 http://127.0.0.1:3200/ready >/dev/null 2>&1 &&
     curl -fsS --max-time 2 http://127.0.0.1:13133/ >/dev/null 2>&1 &&
     curl -fsS --max-time 2 http://127.0.0.1:3031/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS --max-time 3 http://127.0.0.1:3200/ready | tee "$evidence/tempo-ready.txt"
curl -fsS --max-time 3 http://127.0.0.1:13133/ | tee "$evidence/collector-health.json"
curl -fsS --max-time 3 http://127.0.0.1:3031/api/health | tee "$evidence/grafana-health.json"
node ci-cd/docker/tracing-local/smoke.mjs send | tee "$evidence/send-and-query.log"
trace_id="$(sed -n 's/^TRACE_ID=//p' "$evidence/send-and-query.log" | head -1)"
api_span="$(sed -n 's/^API_SPAN_ID=//p' "$evidence/send-and-query.log" | head -1)"
[[ "$trace_id" =~ ^[0-9a-f]{32}$ ]] || { echo "trace ID missing"; exit 1; }
"${compose[@]}" restart tempo otel-collector grafana 2>&1 | tee "$evidence/restart.log"
for i in {1..60}; do
  if curl -fsS --max-time 2 http://127.0.0.1:3200/ready >/dev/null 2>&1 &&
     curl -fsS --max-time 2 http://127.0.0.1:13133/ >/dev/null 2>&1; then break; fi
  sleep 2
done
node ci-cd/docker/tracing-local/smoke.mjs verify "$trace_id" "$api_span" | tee "$evidence/persisted-after-restart.log"
"${compose[@]}" ps > "$evidence/containers.txt"
"${compose[@]}" ps --format json > "$evidence/containers-after-restart.jsonl"
print -r -- "LOCAL_TRACING_PASS trace_id=$trace_id evidence=$evidence" | tee "$evidence/verdict.txt"
