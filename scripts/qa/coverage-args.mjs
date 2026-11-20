/** Preserve each package's coverage include/exclude rules and thresholds.
 * Only the sharded Web suite needs explicit source selection to avoid counting
 * unimported modules once for every independent Vitest group.
 */
export function coverageVitestArgs({ files = [], web = false, index = 0, directory }) {
  if (!directory) throw Error('Missing coverage artifact directory');
  const args = [
    'run', ...files, ...(web ? ['--maxWorkers=1'] : []),
    '--coverage.enabled', '--coverage.provider=v8', '--coverage.reporter=json',
    '--coverage.reportsDirectory=' + directory,
  ];
  if (web) {
    if (index === 0) args.push('--coverage.include=src/**/*.{js,jsx,ts,tsx}');
    args.push('--coverage.exclude=**/*.{test,spec}.{js,jsx,ts,tsx}');
    args.push('--coverage.exclude=**/generated/**');
    args.push('--coverage.exclude=**/*.d.ts');
  }
  return args;
}
