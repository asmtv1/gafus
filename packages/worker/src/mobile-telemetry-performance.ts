import { mobilePerformanceBounds, mobilePerformanceMetrics,
  type MobilePerformanceHistogram } from '@gafus/types';

/** Process-wide sampled observations, never per-user or per-update labels.
 * OTLP retains release dimensions in logs; Prometheus aggregates by operation. */
const metrics = new Map<string,MobilePerformanceHistogram>();
export function addMobilePerformance(platform:string,samples:MobilePerformanceHistogram[]):void {
  if(platform!=='ios'&&platform!=='android')return;
  for(const sample of samples) {
    if(!mobilePerformanceMetrics.includes(sample.metric))continue;
    const key=platform+'|'+sample.metric;
    const current=metrics.get(key)??{metric:sample.metric,count:0,sumMs:0,buckets:mobilePerformanceBounds.map(()=>0)};
    current.count+=sample.count;current.sumMs+=sample.sumMs;
    current.buckets=current.buckets.map((n,i)=>n+sample.buckets[i]!);
    metrics.set(key,current);
  }
}
export function renderMobilePerformance(environment:string):string[] {
  const lines=['# HELP gafus_mobile_performance_duration_ms Sampled client operation durations in milliseconds',
    '# TYPE gafus_mobile_performance_duration_ms histogram'];
  if(environment!=='production'&&environment!=='preview')return lines;
  for(const [key,value] of metrics) {
    const [platform,operation]=key.split('|');
    const labels=`environment="${environment}",platform="${platform}",operation="${operation}"`;
    let cumulative=0;
    for(let i=0;i<mobilePerformanceBounds.length;i++) {
      cumulative+=value.buckets[i]!;
      lines.push(`gafus_mobile_performance_duration_ms_bucket{${labels},le="${mobilePerformanceBounds[i]}"} ${cumulative}`);
    }
    lines.push(`gafus_mobile_performance_duration_ms_bucket{${labels},le="+Inf"} ${value.count}`,
      `gafus_mobile_performance_duration_ms_count{${labels}} ${value.count}`,
      `gafus_mobile_performance_duration_ms_sum{${labels}} ${value.sumMs}`);
  }
  return lines;
}
