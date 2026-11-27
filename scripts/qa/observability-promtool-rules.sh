#!/usr/bin/env bash
# Run the real Prometheus parser/evaluator. YAML parsing alone is not a rule test.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TOOL="${A2_PROMTOOL_BIN:-$(command -v promtool || true)}"
if [ -z "$TOOL" ] || [ ! -x "$TOOL" ]; then
  echo A2_OBS_PROMTOOL_MISSING_RULES_UNVERIFIED
  exit 2
fi
"$TOOL" check rules ci-cd/docker/prometheus/gafus-alerts.yml
"$TOOL" test rules ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml
"$TOOL" test rules ci-cd/docker/prometheus/gafus-alerts-agent2.promtool.test.yml
"$TOOL" test rules ci-cd/docker/prometheus/gafus-alerts-operational.promtool.test.yml
echo A2_OBS_PROMTOOL_RULES_AND_ALL_FIXTURE_SUITES_PASS
