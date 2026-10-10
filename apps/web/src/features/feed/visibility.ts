/**
 * Production Web feed visibility watcher. Requires >=50% intersection,
 * a focused visible tab, and accumulated active foreground time.
 * Extracted from the card so it can be exercised in a real Chromium E2E.
 */
export function observeFeedVisibility(
  element: Element,
  options: {
    visibleFraction: number;
    qualifiedAfterMs: number;
    onQualified: () => void;
    onDwell: (visibleMs: number) => void;
  },
): () => void {
  let visible = false, qualified = false, dwellSent = false;
  let activeSince: number | null = null;
  let accumulated = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const liveMs = () => accumulated + (activeSince === null ? 0 : performance.now() - activeSince);

  const qualify = () => {
    if (qualified || document.visibilityState !== "visible" || !visible || !document.hasFocus()) return;
    if (liveMs() < options.qualifiedAfterMs) return;
    qualified = true;
    options.onQualified();
  };
  const stop = () => {
    if (activeSince !== null) { accumulated += performance.now() - activeSince; activeSince = null; }
    if (timer) clearTimeout(timer);
    timer = undefined;
    qualify();
    if (qualified && !dwellSent && accumulated >= options.qualifiedAfterMs) {
      dwellSent = true;
      options.onDwell(Math.min(120_000, Math.max(0, Math.round(accumulated))));
    }
  };
  const update = () => {
    if (visible && document.visibilityState === "visible" && document.hasFocus()) {
      if (activeSince === null) activeSince = performance.now();
      if (timer) clearTimeout(timer);
      if (!qualified) timer = setTimeout(qualify, Math.max(0, options.qualifiedAfterMs - accumulated));
    } else stop();
  };
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting &&
      entry.intersectionRatio >= options.visibleFraction);
    update();
  }, { threshold: [0, options.visibleFraction, 1] });
  observer.observe(element);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("blur", update);
  window.addEventListener("focus", update);
  return () => {
    stop(); observer.disconnect();
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("blur", update);
    window.removeEventListener("focus", update);
  };
}
