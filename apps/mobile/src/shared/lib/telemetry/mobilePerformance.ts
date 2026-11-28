import { mobilePerformanceBounds, mobilePerformanceMetrics, type MobilePerformanceMetric,
  type MobilePerformanceHistogram } from "@gafus/types";

/** One fixed-size histogram per known operation, sampled at the JS session
 * level. No event on each successful request and no high-cardinality labels. */
export function createMobilePerformanceBuffer(enabled:boolean) {
  const pending=new Map<MobilePerformanceMetric,MobilePerformanceHistogram>();
  return {
    enabled,
    record(metric:MobilePerformanceMetric,ms:number) {
      if(!enabled||!mobilePerformanceMetrics.includes(metric)||!Number.isFinite(ms)||ms<0)return;
      const value=Math.min(300_000,Math.round(ms));
      const histogram=pending.get(metric)??{metric,count:0,sumMs:0,buckets:mobilePerformanceBounds.map(()=>0)};
      if(histogram.count>=256)return;
      const i=mobilePerformanceBounds.findIndex(bound=>value<=bound);
      histogram.count++;histogram.sumMs+=value;histogram.buckets[i]!++;
      pending.set(metric,histogram);
    },
    take():MobilePerformanceHistogram[] {
      const snapshot=[...pending.values()];
      pending.clear();
      return snapshot;
    },
    restore(snapshot:MobilePerformanceHistogram[]) {
      for(const histogram of snapshot) {
        const current=pending.get(histogram.metric);
        if(!current)pending.set(histogram.metric,histogram);
        else if(current.count+histogram.count<=256) {
          current.count+=histogram.count;current.sumMs+=histogram.sumMs;
          current.buckets=current.buckets.map((n,i)=>n+histogram.buckets[i]!);
        }
      }
    },
  };
}
export const mobilePerformance=createMobilePerformanceBuffer(
  process.env.EXPO_PUBLIC_TELEMETRY_ENABLED==="true"&&Math.random()<0.1,
);
const startupAt=Date.now();
let startupRecorded=false;
export function recordMobileStartupReady() {
  if(startupRecorded)return;
  startupRecorded=true;
  mobilePerformance.record("JS_STARTUP_READY",Date.now()-startupAt);
}

/** Measure an operation attempt without changing its result or failure. */
export async function measureMobileOperation<T>(
  metric: MobilePerformanceMetric, operation: () => Promise<T>,
): Promise<T> {
  if (!mobilePerformance.enabled) return operation();
  const start = performance.now();
  try { return await operation(); }
  finally { mobilePerformance.record(metric, performance.now() - start); }
}

/** A sampled foreground timer-delay proxy, not native FPS or ANR detection.
 * Long gaps from OS suspension are discarded. Restart on foreground entry. */
export function startMobileTimerDelaySampling(isActive: () => boolean): () => void {
  if (!mobilePerformance.enabled) return () => undefined;
  const interval = 5000;
  let previous = performance.now();
  let wasActive = isActive();
  const timer = setInterval(() => {
    const now = performance.now();
    const active = isActive();
    const elapsed = now - previous;
    if (active && wasActive && elapsed >= interval && elapsed < 30000)
      mobilePerformance.record("JS_TIMER_DELAY", elapsed - interval);
    previous = now;
    wasActive = active;
  }, interval);
  return () => clearInterval(timer);
}
