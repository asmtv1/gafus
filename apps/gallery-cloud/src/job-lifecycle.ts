/** Ensure a one-shot Cloud.ru Gallery Job actually exits after Core work settles.
 * AWS HTTP agent keep-alive handles must not keep an otherwise finished Job
 * in the provider's running pool indefinitely.
 */
export function runGalleryOneShot(
  maintenance: () => Promise<unknown>,
  hooks: {
    exit?: (code: number) => void;
    report?: (event: string, fields: Record<string, number>) => void;
    exitCode?: (code: number) => void;
  } = {},
): Promise<number> {
  const exit = hooks.exit ?? ((code: number) => process.exit(code));
  const report = hooks.report ?? ((event: string, fields: Record<string, number>) =>
    console.log(JSON.stringify({event, ...fields})));
  const mark = hooks.exitCode ?? ((code: number) => { process.exitCode = code; });
  const started = Date.now();
  let settled = false;
  // Below Cloud.ru's 120s Job timeout. Does not interrupt ordinary 50s work.
  const watchdog = setTimeout(() => {
    if (!settled) {
      report("gallery_invocation_hard_timeout", {elapsedMs: Date.now() - started});
      exit(1);
    }
  }, 110_000);
  watchdog.unref();

  function finish(code: number): number {
    settled = true;
    clearTimeout(watchdog);
    report(code === 0 ? "gallery_invocation_completed" : "gallery_invocation_failed",
      {elapsedMs: Date.now() - started});
    mark(code);
    // Flush stdout; if HTTP keep-alive still holds the event loop, exit anyway.
    // This runs only AFTER all awaited Core/S3 calls have settled.
    const linger = setTimeout(() => exit(code), 1000);
    linger.unref();
    return code;
  }
  return Promise.resolve().then(maintenance).then(
    () => finish(0),
    () => finish(1),
  );
}
