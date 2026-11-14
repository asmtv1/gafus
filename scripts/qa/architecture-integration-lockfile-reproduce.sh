#!/usr/bin/env bash
# Reproducible lock-only reconciliation of live A1 manifest inputs and A2 OTLP.
# Writes ONLY a new isolated directory under user's Logs, never Git worktrees.
set -euo pipefail
NAME="${1:-}"
if [[ ! "$NAME" =~ ^[a-zA-Z0-9_-]{4,64}$ ]]; then
  echo 'USAGE: bash scripts/qa/architecture-integration-lockfile-reproduce.sh <unique-run-id>' >&2
  exit 2
fi
A1=/Users/asmtv1/Desktop/gafus-refactor
A2=/Users/asmtv1/Desktop/gafus-agent2-observability
BASE="$HOME/Library/Logs/gafus-refactor-regression"
OUT="$BASE/a2-lockfile-proof-$NAME"
CAND="$OUT/candidate"
if [[ -e "$OUT" ]]; then echo 'REFUSE_OVERWRITE_PREVIOUS_PROOF' >&2; exit 2; fi
mkdir -p "$OUT" "$CAND"
export A1 A2 OUT CAND
python3 - <<'PY'
from pathlib import Path
from hashlib import sha256
import json,os,shutil
source=Path(os.environ['A1']).resolve();target=Path(os.environ['CAND']).resolve()
assert target!=source and not source in target.parents
paths=['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','.npmrc',
       'scripts/check-workspace-graph.mjs','scripts/architecture-workspace-cycles.json',
       'packages/prisma/schema.prisma']
paths += [str(p.relative_to(source)) for group in ('apps','packages')
          for p in (source/group).glob('*/package.json') if p.is_file()]
paths += [str(p.relative_to(source)) for p in (source/'patches').glob('*.patch')]
paths=sorted(set(paths))
for rel in paths:
    a=source/rel;b=target/rel
    if a.is_symlink() or not a.is_file():raise SystemExit('UNSAFE_MISSING_INPUT:'+rel)
    b.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(a,b)
    if sha256(a.read_bytes()).digest()!=sha256(b.read_bytes()).digest():raise SystemExit('SNAPSHOT_COPY_MISMATCH:'+rel)
manifest={rel:sha256((target/rel).read_bytes()).hexdigest() for rel in paths}
(Path(os.environ['OUT'])/'input-snapshot.json').write_text(json.dumps({
    'kind':'gafus/a2-lock-input-snapshot/v1','a1Root':str(source),
    'candidateRoot':str(target),'files':manifest,
    'fileCount':len(manifest),'snapshotLockSha256':manifest['pnpm-lock.yaml']},indent=2)+'\n')
print('ISOLATED_INPUT_COPY_READY',len(paths),'files; lock sha',manifest['pnpm-lock.yaml'])
PY
(
  cd "$CAND"
  pnpm install --lockfile-only --offline --ignore-scripts > "$OUT/pnpm-regenerate.log" 2>&1
  pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts > "$OUT/pnpm-frozen.log" 2>&1
)
node "$CAND/scripts/check-workspace-graph.mjs" > "$OUT/workspace-graph.log" 2>&1
python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['CAND'])/'packages/prisma/schema.prisma'
a=p.read_text();needle='  provider      = "prisma-client-js"\n'
assert a.count(needle)==1
if 'previewFeatures = ["metrics"]' not in a:
    p.write_text(a.replace(needle,needle+'  previewFeatures = ["metrics"]\n',1))
    assert p.read_text().replace('  previewFeatures = ["metrics"]\n','',1)==a
PY
(
  export DATABASE_URL='postgresql://preflight:unused@127.0.0.1:65432/nonexistent'
  "$A2/packages/prisma/node_modules/.bin/prisma" validate --schema "$CAND/packages/prisma/schema.prisma"
) > "$OUT/prisma-validate.log" 2>&1
# Generator-only metrics flag must not cause a database migration.
(
  export DATABASE_URL='postgresql://preflight:unused@127.0.0.1:65432/nonexistent'
  "$A2/packages/prisma/node_modules/.bin/prisma" migrate diff \
    --from-schema-datamodel "$A1/packages/prisma/schema.prisma" \
    --to-schema-datamodel "$CAND/packages/prisma/schema.prisma" --script
) > "$OUT/prisma-ddl-diff.log" 2>&1
if ! grep -q -- '-- This is an empty migration.' "$OUT/prisma-ddl-diff.log"; then
  echo 'PRISMA_DDL_DIFF_NONEMPTY_OR_UNEXPECTED' >&2
  exit 3
fi
(
  cd "$A2"
  node --test scripts/qa/otel-local-collector.test.mjs ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
) > "$OUT/telemetry-local.log" 2>&1
(
  cd "$A2"
  node scripts/qa/architecture-integration-lockfile-validate.mjs \
    --candidate "$CAND" --source "$A1" --a2 "$A2"
) > "$OUT/lock-validation.json"
python3 - <<'PY'
import hashlib,json,os
from pathlib import Path
source=Path(os.environ['A1']);out=Path(os.environ['OUT']);copy=Path(os.environ['CAND'])
inputs=json.loads((out/'input-snapshot.json').read_text())['files']
drift=[rel for rel,original in inputs.items() if not (source/rel).is_file()
       or hashlib.sha256((source/rel).read_bytes()).hexdigest()!=original]
validation=json.loads((out/'lock-validation.json').read_text())
lock=hashlib.sha256((copy/'pnpm-lock.yaml').read_bytes()).hexdigest()
expected=os.environ.get('GAFUS_EXPECTED_LOCK_SHA')
report={'kind':'gafus/a2-lock-reconciliation-receipt/v1',
        'sourceSnapshotLockSha256':inputs['pnpm-lock.yaml'],
        'isolatedRegeneratedLockSha256':lock,
        'expectedShaProvided':expected,'expectedShaVerified':expected is None or lock==expected,
        'sourceInputDrift':drift,
        'sourceInputCount':len(inputs),'candidatePath':str(copy),
        'validationStatus':validation['verdict'],'validationChecks':validation['checksTotal'],
        'validationPassed':validation['passed'],
        'prisma':'PASS','prismaDDLNoop':'PASS','telemetry':'PASS','workspaceGraph':'PASS','frozenOffline':'PASS',
        'noSourceWrites':True,'noGitHistoryMutation':True,'integrationApproved':False}
(out/'receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
if drift or validation['failed'] or (expected and lock!=expected):raise SystemExit('LOCK_REPRO_PROOF_FAILED')
PY
