# GAFUS local persistent tracing

Local-only, isolated Compose project. No changes to production deployment or
working API/Worker source. Existing @gafus/logger/server-telemetry already
emits OTLP/HTTP when configured; this supplies the missing permanent backend.

## Start
```sh
docker compose -f ci-cd/docker/tracing-local/compose.yaml up -d
docker compose -f ci-cd/docker/tracing-local/compose.yaml ps
GAFUS_TRACING_PASSWORD='set-a-local-password' docker compose -f ci-cd/docker/tracing-local/compose.yaml up -d
```
Use one start command, not both; to change Grafana's password on an existing
volume use its password reset CLI, not an environment change alone.

- Grafana: http://127.0.0.1:3031 (admin / gafus-local-dev-only by default).
- Tempo read API: http://127.0.0.1:3200.
- Collector OTLP/HTTP: http://127.0.0.1:4318/v1/traces.
- Collector OTLP/gRPC: 127.0.0.1:4317.
- Health: http://127.0.0.1:13133/.
- Host API/Worker: set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces`.
  For containers on this Compose network use `http://otel-collector:4318/v1/traces`.
  For API/Worker in another Compose project, attach them to the internal
  tracing network in a deliberately isolated test or terminate TLS in a
  reviewed gateway. The existing GAFUS SDK deliberately rejects arbitrary
  plain-HTTP hostnames such as host.docker.internal.
- To test all real SDK components, run `node ci-cd/docker/tracing-local/smoke.mjs send`.
  Re-run `node ci-cd/docker/tracing-local/smoke.mjs verify TRACE_ID API_SPAN_ID`
  after `docker compose -f ci-cd/docker/tracing-local/compose.yaml restart`.

## Safety and durability
Only loopback host ports; private Docker volumes; no public service, external
network, user data or cloud credentials. Local blocks and WAL persist across
`restart` and `down`/up; `down -v` ERASES stored trace data. Trace block
retention is 168 hours. Production must use reviewed access control, TLS,
separate resources/quotas, tested backup policy and appropriate S3 lifecycle
instead; this Compose stack is **not** production-ready.

This proves local OTLP -> persisted Tempo and cross-process parent correlation.
It does not constitute deployed staging evidence or clear the staging
release gate. CI/real Cloud.ru/Beget remain independent requirements.
