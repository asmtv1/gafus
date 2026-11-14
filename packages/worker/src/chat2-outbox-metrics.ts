/**
 * Pure Prometheus presentation; persistence is explicitly injected from the
 * already isolated Chat2 worker repository. No new Prisma dependency here.
 */
export interface Chat2OutboxMetricsSnapshot {
  pending: number;
  dead: number;
  oldest: Date | null;
  leased: number;
}
export function renderChat2OutboxMetricsPrometheus(
  snapshot: Chat2OutboxMetricsSnapshot,
  now = new Date(),
): string {
  const oldestAge = snapshot.oldest
    ? Math.max(0, (now.getTime() - snapshot.oldest.getTime()) / 1000)
    : 0;
  return (
    [
      "# HELP gafus_chat2_outbox_pending Undelivered non-DLQ events",
      "# TYPE gafus_chat2_outbox_pending gauge",
      "gafus_chat2_outbox_pending " + snapshot.pending,
      "# HELP gafus_chat2_outbox_leased Current claimed events",
      "# TYPE gafus_chat2_outbox_leased gauge",
      "gafus_chat2_outbox_leased " + snapshot.leased,
      "# HELP gafus_chat2_outbox_dead_letters Undeliverable events retained for operator retry",
      "# TYPE gafus_chat2_outbox_dead_letters gauge",
      "gafus_chat2_outbox_dead_letters " + snapshot.dead,
      "# HELP gafus_chat2_outbox_oldest_age_seconds Age of oldest outstanding outbox event",
      "# TYPE gafus_chat2_outbox_oldest_age_seconds gauge",
      "gafus_chat2_outbox_oldest_age_seconds " + oldestAge,
    ].join("\n") + "\n"
  );
}

/**
 * Process-local counters: no high-cardinality labels, object keys, IDs or
 * provider error strings. Prometheus rate() tolerates resets at restarts.
 * A separate store can be injected in tests to avoid global counter leakage.
 */
export type Chat2OutboxOutcome = "delivered" | "retry" | "dead_letter" | "stale";
export type Chat2OutboxFailureClass = "retryable" | "terminal";
export function createChat2OutboxExecutionMetrics() {
  const outcomes: Record<Chat2OutboxOutcome, number> = {
    delivered: 0,
    retry: 0,
    dead_letter: 0,
    stale: 0,
  };
  const failures: Record<Chat2OutboxFailureClass, number> = { retryable: 0, terminal: 0 };
  const bounds = [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30, 60];
  const buckets = bounds.map(() => 0);
  let sumSeconds = 0;
  let count = 0;
  function record(input: {
    outcome: Chat2OutboxOutcome;
    failureClass?: Chat2OutboxFailureClass;
    durationMs: number;
  }): void {
    outcomes[input.outcome]++;
    if (input.failureClass) failures[input.failureClass]++;
    const seconds = Number.isFinite(input.durationMs) ? Math.max(0, input.durationMs / 1000) : 0;
    sumSeconds += seconds;
    count++;
    bounds.forEach((bound, index) => {
      if (seconds <= bound) buckets[index]!++;
    });
  }
  function render(): string {
    const job = 'job_type="chat2_outbox"';
    const lines = [
      "# HELP job_attempts_total Claimed Chat2 outbox dispatch attempts by outcome",
      "# TYPE job_attempts_total counter",
      ...Object.entries(outcomes).map(
        ([outcome, value]) => `job_attempts_total{${job},outcome="${outcome}"} ${value}`,
      ),
      "# HELP job_failures_total Retryable or terminal failures of Chat2 outbox attempts",
      "# TYPE job_failures_total counter",
      ...Object.entries(failures).map(
        ([failureClass, value]) => `job_failures_total{${job},class="${failureClass}"} ${value}`,
      ),
      "# HELP job_duration_seconds Time spent in claimed Chat2 outbox dispatches",
      "# TYPE job_duration_seconds histogram",
      ...bounds.map(
        (bound, idx) => `job_duration_seconds_bucket{${job},le="${bound}"} ${buckets[idx]}`,
      ),
      `job_duration_seconds_bucket{${job},le="+Inf"} ${count}`,
      `job_duration_seconds_sum{${job}} ${sumSeconds}`,
      `job_duration_seconds_count{${job}} ${count}`,
    ];
    return lines.join("\n") + "\n";
  }
  return { record, render };
}
export const chat2OutboxExecutionMetrics = createChat2OutboxExecutionMetrics();
