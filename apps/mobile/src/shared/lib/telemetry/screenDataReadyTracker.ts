/** One successful data-ready sample per visible foreground visit. The caller
 * supplies committed readiness, not a request completion callback. No route
 * params, actor IDs, or payloads are sent to the recorder. */
export type ScreenDataReadyMetric = Extract<
  import("@gafus/types").MobilePerformanceMetric,
  `SCREEN_${string}_DATA_READY`
>;

type Options = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  isActive: () => boolean;
  record: (durationMs: number) => void;
};

export function createScreenDataReadyTracker(options: Options) {
  let ready = false;
  let visit: { started: number; recorded: boolean } | undefined;
  let pending: number | undefined;
  let generation = 0;

  function cancel() {
    generation++;
    if (pending !== undefined) options.cancelFrame(pending);
    pending = undefined;
  }

  function end() {
    cancel();
    visit = undefined;
  }

  function schedule() {
    if (!visit || visit.recorded || !ready || pending !== undefined || !options.isActive()) return;
    const ticket = ++generation;
    const current = visit;
    const valid = () =>
      ticket === generation && visit === current && ready && options.isActive();
    // Wait until the successful content commit has had two frame opportunities.
    // This is a JS-visible presentation proxy, not a GPU or native media paint.
    pending = options.requestFrame(() => {
      if (!valid()) return;
      pending = options.requestFrame(() => {
        if (!valid()) return;
        pending = undefined;
        current.recorded = true;
        const duration = options.now() - current.started;
        if (Number.isFinite(duration) && duration >= 0) options.record(duration);
      });
    });
  }

  return {
    begin() {
      end();
      if (!options.isActive()) return;
      visit = { started: options.now(), recorded: false };
      schedule();
    },
    setReady(value: boolean) {
      ready = value;
      if (!ready) cancel();
      else schedule();
    },
    end,
  };
}
