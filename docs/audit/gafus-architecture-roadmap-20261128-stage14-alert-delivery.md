# Stage 14 — isolated Prometheus / Alertmanager transport acceptance
Date: 2026-11-28 local (2026-11-27 UTC). **PASS**.

This supplements and supersedes only the Prometheus transport BLOCKED row in
`gafus-architecture-roadmap-20261128-worker-recovery.md`.
Branch: `qa/stage7-14-worker-recovery-20261128`.
Accepted R6 base: `337b00899801d5d068180efbe2f6869406b4eea6`.
Tested SHA: `09e4c9b3f1e6a9260340f0eeafcf3da3da149de7`.

## Acquisition and integrity

The first invocation returned curl 28 after 96,026,615 of 109,721,715 bytes,
then connection resets. The retry used the existing isolated script with a
harness-only hardening commit: verify the exact archive SHA-256 against the
official release's sha256sums.txt before extraction/execution; one attempt per
URL (curl retry 0), bounded connect and transfer timeouts. No rule changes.

| Archive | Official release base | Verified SHA-256 |
|---|---|---|
| prometheus-3.15.1.darwin-arm64.tar.gz | https://github.com/prometheus/prometheus/releases/download/v3.15.1/ | 0d4d3d9837d27e4fcd0bd16d115b1b8d6732a4bf3e69107f1190d9ef653ae471 |
| alertmanager-0.29.0.darwin-arm64.tar.gz | https://github.com/prometheus/alertmanager/releases/download/v0.29.0/ | 05fa12ebfa8eb4d8907d708cfc79900fee488cbef73b7fa64b59ee30e16a774f |

Both official archives and checksums were obtained on the single retry. No
container image or mirror was necessary. This verifies integrity against the
official HTTPS release checksums, not an independent signature.

## Execution

```sh
bash scripts/qa/prometheus-alertmanager-isolated.sh
```

Executed via durable McpGo Terminal1 job
`4c744d2dffab087a8b97c5d998e2eb2df22880ab7f92c041`.
State exited, exit code 0, timed_out false, duration 115554 ms.

| Gate | Result |
|---|---|
| promtool check production rules | PASS, 40 rules |
| gafus-alerts.promtool.test.yml | PASS, 8 named scenarios |
| gafus-alerts-agent2.promtool.test.yml | PASS, 12 named scenarios |
| gafus-alerts-operational.promtool.test.yml | PASS, 5 named scenarios |
| reset_zero_traffic_is_not_stalled at 15m | PASS: neither password reset stalled nor metrics unavailable fires |
| missing_mail_metrics_not_false_reset_failure | PASS: missing data alerts metrics unavailable, not false reset failure |
| Prometheus / Alertmanager config validators | PASS |
| GafusChat2OutboxDeadLetters | PASS, firing + resolved webhook receipts |
| GafusMediaLeaseStalled | PASS, firing + resolved webhook receipts |
| Temporary directory cleanup | PASS, exact run directory absent |

Actual local pipeline: loopback metrics HTTP server provides gauge 2, real
Prometheus scrapes/evaluates, real Alertmanager routes to loopback webhook;
after both firing receipts the fixture switches gauge to 0 and waits for both
resolved receipts. All four distinct name/status pairs recorded.
Both alerts start at 2026-11-27T22:33:36.877Z and end at 22:33:38.877Z;
the webhook summary was written at 22:33:43.991220Z.
These are alert lifecycle timestamps, not independent end-to-end latency
measurements.

## Scope / limits

Transport profile uses its existing 3-second FOR window for the two synthetic
rules; the real production rule windows are separately tested by promtool
fixtures unchanged. The no-traffic case is a rule fixture, not a production
notification delivery trial. No real notification channels, secrets,
production endpoints, deploy, push, physical devices, heavy builds, or R6
rerun. No production alert routing or external provider delivery claimed.
No remaining blocker for this isolated transport gate.

Evidence: `docs/audit/evidence/stage14-alert-delivery-20261128/`
contains initial network failure, successful run log, four webhook receipts,
job metadata and SHA256SUMS. This is a stage-specific receipt, not integrated
single-SHA acceptance of the entire roadmap.
