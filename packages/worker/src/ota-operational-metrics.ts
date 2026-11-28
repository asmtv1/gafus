type EventRow = { platform: string; event: string; count: number };
const platforms = ["ios", "android"] as const;
const events = ["LAUNCHED", "CHECKED", "DOWNLOADED", "UPDATE_ERROR", "ROLLBACK_DETECTED", "SIGNATURE_REJECTED", "MANDATORY_ATTEMPT", "MANDATORY_INCOMPLETE"] as const;

/** Rolling counts are gauges, never cumulative counters or unique-installation rates. */
export function renderOtaOperationalMetrics(rows: readonly EventRow[] | null): string {
  const metric = "gafus_mobile_telemetry_ota_reported_events_1h";
  const availability = "gafus_mobile_telemetry_ota_metrics_available";
  const lines = ["# TYPE " + availability + " gauge", availability + " " + (rows === null ? 0 : 1)];
  if (rows !== null) {
    lines.push("# TYPE " + metric + " gauge");
    for (const platform of platforms) {
      for (const event of events) {
        const count = rows.find(row => row.platform === platform && row.event === event)?.count ?? 0;
        lines.push(metric + '{platform="' + platform + '",event="' + event + '"} ' + count);
      }
    }
  }
  return lines.join("\n") + "\n";
}
