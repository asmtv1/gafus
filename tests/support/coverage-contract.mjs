/** Pure validation of V8 Istanbul-compatible JSON summary; a zero denominator is never 100% coverage. */
export function verifyCoverage(summary, expectedSources) {
  const errors = [];
  if (!summary || typeof summary !== 'object' || !summary.total) {
    return { valid:false, errors:['Missing coverage summary'], totals:null };
  }
  const sources = Object.entries(summary).filter(([path])=>path !== 'total');
  if (!Array.isArray(expectedSources) || expectedSources.length===0) errors.push('Missing expected source list');
  for (const expected of expectedSources || []) {
    const matching=sources.filter(([path])=>path===expected || path.endsWith('/'+expected));
    if (matching.length!==1) { errors.push(`Source not uniquely covered: ${expected}`); continue; }
    for (const metric of ['lines','branches']) {
      const count=matching[0][1][metric];
      if (!count || !Number.isInteger(count.total) || count.total<=0) errors.push(`Empty ${metric} coverage denominator: ${expected}`);
    }
  }
  for (const metric of ['lines','branches']) {
    const all=summary.total[metric];
    if (!all || !Number.isInteger(all.total) || all.total<=0) errors.push(`Empty total ${metric} coverage denominator`);
    else if (!Number.isInteger(all.covered) || all.covered<0 || all.covered>all.total) errors.push(`Invalid ${metric} covered count`);
  }
  return { valid:errors.length===0, errors, totals:{ lines:summary.total.lines, branches:summary.total.branches } };
}
