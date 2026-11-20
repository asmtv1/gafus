// Pure, dependency-free fail-closed validation. No release decision without exact evidence.
export function evaluateRun(plan, receipts, currentCommit = plan.commit) {
  if (!plan || !Array.isArray(plan.tasks) || typeof plan.fingerprint !== 'string' ||
      !plan.fingerprint || typeof plan.runId !== 'string' || !plan.runId) {
    return { code: 2, summary: 'Invalid or missing plan', outcomes: [] };
  }
  if (plan.commit !== currentCommit) {
    return { code: 2, summary: 'Commit mismatch', outcomes: [] };
  }
  if (plan.tasks.length === 0 && plan.emptyReason !== 'documentation-only') {
    return { code: 2, summary: 'Empty required plan', outcomes: [] };
  }
  const expectations = new Map();
  for (const task of plan.tasks) {
    const key = [task.id, task.platform, task.part].join('|');
    if (expectations.has(key)) return { code: 2, summary: 'Duplicate expected task ' + key, outcomes: [] };
    expectations.set(key, task);
  }
  const received = new Map();
  for (const r of receipts || []) {
    const key = [r.id, r.platform, r.part].join('|');
    if (received.has(key)) return { code: 2, summary: 'Duplicate receipt ' + key, outcomes: [] };
    received.set(key, r);
  }
  const outcomes = [];
  let incomplete = false;
  let failed = false;
  for (const [key, task] of expectations) {
    const r = received.get(key);
    let status = 'passed', reason = '';
    if (!r) { status = 'incomplete'; reason = 'missing result'; }
    else if (r.commit !== plan.commit || r.fingerprint !== plan.fingerprint ||
             r.runId !== plan.runId || !Number.isInteger(r.attempt) || r.attempt < 1) {
      status = 'incomplete'; reason = 'foreign or malformed receipt';
    } else if (r.status === 'failed') { status = 'failed'; reason = r.reason || 'assertion failed'; }
    else if (r.status !== 'passed' || !r.evidencePath) {
      status = 'incomplete'; reason = r.reason || 'missing evidence, skipped or blocked';
    } else if (task.expectedCases?.length) {
      if (!Array.isArray(r.cases) || r.cases.length === 0) {
        status = 'incomplete'; reason = 'empty named result set';
      } else {
        // Vitest exposes a full hierarchical name; migration records may name
        // either the full case or its unique title. Never accept a skipped match.
        const matchingStatus = (name) => {
          const matching = r.cases.filter((c) => c.name === name || c.fullName === name ||
            (typeof c.fullName === 'string' && c.fullName.endsWith(' ' + name)));
          return matching.length === 1 ? matching[0].status : null;
        };
        for (const name of task.expectedCases) {
          if (matchingStatus(name) !== 'passed') {
            status = 'incomplete';
            reason = 'required case missing, skipped or not passed: ' + name;
            break;
          }
        }
      }
    }
    if (status === 'incomplete') incomplete = true;
    if (status === 'failed') failed = true;
    outcomes.push({ id: task.id, platform: task.platform, part: task.part, status, reason,
      attempt: r?.attempt ?? null,
      unstable: status === 'passed' && Number.isInteger(r?.attempt) && r.attempt > 1,
      durationMs: r?.durationMs ?? null, reproduction: task.reproduction || null });
  }
  for (const key of received.keys()) if (!expectations.has(key)) {
    incomplete = true;
    outcomes.push({ id: key, status: 'incomplete', reason: 'unexpected receipt', durationMs: null });
  }
  // Incompleteness is a distinct environment/report failure and takes precedence.
  const code = incomplete ? 2 : failed ? 1 : 0;
  return { code, summary: code === 0 ? 'All expected checks passed' :
    code === 1 ? 'Required assertion failed' : 'Missing or invalid required evidence',
    unstableAttempts: outcomes.filter(o=>o.unstable).map(o=>({id:o.id,attempt:o.attempt})),
    outcomes };
}
