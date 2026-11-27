#!/bin/bash
# Real Prometheus -> Alertmanager -> loopback webhook acceptance.
# No production endpoints, databases, credentials, or persistent services.
# The shortened FOR window is ONLY for transport integration; the original
# production FOR window is verified by the separate promtool rule fixtures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
if ! grep -Fq 'expr: gafus_chat2_outbox_dead_letters > 0' ci-cd/docker/prometheus/gafus-alerts.yml || \
   ! grep -Fq 'expr: gafus_media_stalled_processing > 0' ci-cd/docker/prometheus/gafus-alerts.yml; then
  echo "FAIL: production Chat2 DLQ alert expression changed"
  exit 1
fi
DIR="$(mktemp -d /tmp/gafus-archqa-alert-delivery.XXXXXX)"
prom_pid='' am_pid='' sink_pid=''
cleanup() {
  for pid in "$prom_pid" "$am_pid" "$sink_pid"; do
    if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  rm -rf -- "$DIR"
}
trap cleanup EXIT INT TERM
port() {
  python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
}
AM_PORT="$(port)"
PROM_PORT="$(port)"
SINK_PORT="$(port)"
echo "Downloading isolated upstream Prometheus and Alertmanager binaries to temporary workspace"
download_verified() {
  local project="$1" version="$2" filename="$3" archive="$4"
  local base="https://github.com/prometheus/$project/releases/download/v$version"
  curl -fsSL --retry 0 --connect-timeout 15 --max-time 60 "$base/sha256sums.txt" -o "$DIR/$project.sha256sums"
  curl -fsSL --retry 0 --connect-timeout 15 --max-time 240 "$base/$filename" -o "$DIR/$archive"
  python3 - "$DIR/$project.sha256sums" "$filename" "$DIR/$archive" <<'VERIFY'
import hashlib, pathlib, re, sys
sums, name, archive = sys.argv[1:]
matches = [parts[0] for line in pathlib.Path(sums).read_text().splitlines()
           if len(parts := line.split()) == 2 and parts[1].lstrip("*") == name]
assert len(matches) == 1 and re.fullmatch(r"[0-9a-fA-F]{64}", matches[0]), "missing unique official checksum"
with open(archive, "rb") as stream:
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        h.update(chunk)
    digest = h.hexdigest()
assert digest == matches[0].lower(), "archive SHA256 mismatch"
print("VERIFIED upstream SHA256:", digest, name)
VERIFY
}
download_verified prometheus 3.15.1 prometheus-3.15.1.darwin-arm64.tar.gz prometheus.tar.gz
download_verified alertmanager 0.29.0 alertmanager-0.29.0.darwin-arm64.tar.gz alertmanager.tar.gz
tar -xzf "$DIR/prometheus.tar.gz" -C "$DIR"
tar -xzf "$DIR/alertmanager.tar.gz" -C "$DIR"
PROM="$DIR/prometheus-3.15.1.darwin-arm64/prometheus"
PROMTOOL="$DIR/prometheus-3.15.1.darwin-arm64/promtool"
AM="$DIR/alertmanager-0.29.0.darwin-arm64/alertmanager"
AMTOOL="$DIR/alertmanager-0.29.0.darwin-arm64/amtool"
test -x "$PROM" && test -x "$PROMTOOL" && test -x "$AM" && test -x "$AMTOOL"
"$PROMTOOL" check rules ci-cd/docker/prometheus/gafus-alerts.yml
"$PROMTOOL" test rules ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml
"$PROMTOOL" test rules ci-cd/docker/prometheus/gafus-alerts-agent2.promtool.test.yml
"$PROMTOOL" test rules ci-cd/docker/prometheus/gafus-alerts-operational.promtool.test.yml
cat > "$DIR/alertmanager.yml" <<EOF
global:
  resolve_timeout: 10s
route:
  receiver: qa-webhook
  group_wait: 1s
  group_interval: 5s
  repeat_interval: 1m
receivers:
  - name: qa-webhook
    webhook_configs:
      - url: "http://127.0.0.1:$SINK_PORT/notify"
        send_resolved: true
EOF
cat > "$DIR/alert-rules.yml" <<EOF
groups:
  - name: isolated-chat2-alert-delivery
    rules:
      - alert: GafusChat2OutboxDeadLetters
        expr: gafus_chat2_outbox_dead_letters > 0
        for: 3s
        labels:
          severity: warning
        annotations:
          summary: Chat2 outbox dead letters need an admin review
      - alert: GafusMediaLeaseStalled
        expr: gafus_media_stalled_processing > 0
        for: 3s
        labels:
          severity: warning
        annotations:
          summary: GAFUS media processing has expired leases
EOF
cat > "$DIR/prometheus.yml" <<EOF
global:
  scrape_interval: 1s
  evaluation_interval: 1s
rule_files:
  - "$DIR/alert-rules.yml"
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["127.0.0.1:$AM_PORT"]
scrape_configs:
  - job_name: "isolated-synthetic-gauge"
    static_configs:
      - targets: ["127.0.0.1:$SINK_PORT"]
EOF
"$PROMTOOL" check config "$DIR/prometheus.yml" >/dev/null
"$AMTOOL" check-config "$DIR/alertmanager.yml" >/dev/null
python3 -u - "$SINK_PORT" "$DIR/notifications.jsonl" "$DIR/resolve.signal" >"$DIR/sink.log" 2>&1 <<'PY' &
from http.server import BaseHTTPRequestHandler, HTTPServer
import json, sys, os
port = int(sys.argv[1])
path = sys.argv[2]
resolved_signal = sys.argv[3]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/metrics":
            self.send_error(404)
            return
        value = 0 if os.path.exists(resolved_signal) else 2
        payload = (
            "# TYPE gafus_chat2_outbox_dead_letters gauge\n"
            "gafus_chat2_outbox_dead_letters " + str(value) + "\n"
            "# TYPE gafus_media_stalled_processing gauge\n"
            'gafus_media_stalled_processing{pipeline="chat2"} ' + str(value) + "\n"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def do_POST(self):
        if self.path != "/notify":
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        message = json.loads(body)
        with open(path, "a") as out:
            out.write(json.dumps(message) + "\n")
        self.send_response(200)
        self.end_headers()
    def log_message(self, format, *args):
        pass
HTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
sink_pid=$!
"$AM" --config.file="$DIR/alertmanager.yml" --storage.path="$DIR/amdata" \
  --web.listen-address="127.0.0.1:$AM_PORT" \
  --cluster.listen-address="" >"$DIR/alertmanager.log" 2>&1 &
am_pid=$!
"$PROM" --config.file="$DIR/prometheus.yml" --storage.tsdb.path="$DIR/promdata" \
  --web.listen-address="127.0.0.1:$PROM_PORT" >"$DIR/prometheus.log" 2>&1 &
prom_pid=$!
phase=firing
for i in $(seq 1 90); do
  if [ -f "$DIR/notifications.jsonl" ] && python3 - "$DIR/notifications.jsonl" "$phase" <<'PY'
import json,sys
seen=set()
with open(sys.argv[1]) as stream:
    for line in stream:
        payload=json.loads(line)
        names={alert.get("labels",{}).get("alertname") for alert in payload.get("alerts", [])
               if alert.get("status")==sys.argv[2]}
        seen.update(names)
required={"GafusChat2OutboxDeadLetters", "GafusMediaLeaseStalled"}
sys.exit(0 if required.issubset(seen) else 1)
PY
  then
    if [ "$phase" = firing ]; then
      touch "$DIR/resolve.signal"
      phase=resolved
    else
      mkdir -p "$ROOT/artifacts"
      python3 - "$DIR/notifications.jsonl" "$ROOT/artifacts/a2-obs-alert-delivery-summary.json" <<'A2_RECEIPT'
import json,sys,datetime
source,destination=sys.argv[1:]
summary={"runPrefix":"a2-obs-","scope":"isolated Prometheus Alertmanager webhook",
         "recordedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
         "alerts":[]}
seen=set()
for line in open(source):
    message=json.loads(line)
    for alert in message.get("alerts",[]):
        name=alert.get("labels",{}).get("alertname")
        status=alert.get("status")
        if name not in ("GafusChat2OutboxDeadLetters","GafusMediaLeaseStalled") or status not in ("firing","resolved"):
            continue
        key=(name,status)
        if key in seen: continue
        seen.add(key)
        summary["alerts"].append({"name":name,"status":status,
                                 "startsAt":alert.get("startsAt"),
                                 "endsAt":alert.get("endsAt")})
assert len(seen)==4, "missing firing/resolved alert receipts"
with open(destination,"w") as file:
    json.dump(summary,file,indent=2);file.write("\n")
A2_RECEIPT
      echo "PASS: Prometheus -> Alertmanager -> isolated webhook both firing AND resolved for 360p + DLQ"
      exit 0
    fi
  fi
  if ! kill -0 "$prom_pid" 2>/dev/null || ! kill -0 "$am_pid" 2>/dev/null || ! kill -0 "$sink_pid" 2>/dev/null; then
    echo "FAIL: alert-delivery process terminated"
    tail -12 "$DIR/prometheus.log" "$DIR/alertmanager.log" "$DIR/sink.log"
    exit 1
  fi
  sleep 1
done
echo "FAIL: alert was not delivered within isolated acceptance window"
tail -20 "$DIR/prometheus.log" "$DIR/alertmanager.log" "$DIR/sink.log"
exit 1
