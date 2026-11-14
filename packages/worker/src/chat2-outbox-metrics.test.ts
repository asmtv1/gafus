import { describe, expect, it } from "vitest";
import {
  renderChat2OutboxMetricsPrometheus,
  createChat2OutboxExecutionMetrics,
} from "./chat2-outbox-metrics";
describe("Chat2 operational metrics", () => {
  it("exports bounded anonymous queue status and 0 age when empty", async () => {
    const metrics = renderChat2OutboxMetricsPrometheus(
      {
        pending: 0,
        dead: 0,
        leased: 0,
        oldest: null,
      },
      new Date("2026-11-07T01:00:00Z"),
    );
    expect(metrics).toContain("gafus_chat2_outbox_pending 0");
    expect(metrics).toContain("gafus_chat2_outbox_dead_letters 0");
    expect(metrics).toContain("gafus_chat2_outbox_oldest_age_seconds 0");
  });
  it("emits complete bounded low-cardinality counters and histogram", () => {
    const metrics = createChat2OutboxExecutionMetrics();
    metrics.record({ outcome: "delivered", durationMs: 20 });
    metrics.record({ outcome: "retry", failureClass: "retryable", durationMs: 120 });
    metrics.record({ outcome: "dead_letter", failureClass: "terminal", durationMs: 60000 });
    metrics.record({ outcome: "stale", durationMs: 100000 });
    const text = metrics.render();
    expect(text).toContain('job_attempts_total{job_type="chat2_outbox",outcome="delivered"} 1');
    expect(text).toContain('job_attempts_total{job_type="chat2_outbox",outcome="retry"} 1');
    expect(text).toContain('job_attempts_total{job_type="chat2_outbox",outcome="dead_letter"} 1');
    expect(text).toContain('job_failures_total{job_type="chat2_outbox",class="terminal"} 1');
    expect(text).toContain('job_failures_total{job_type="chat2_outbox",class="retryable"} 1');
    expect(text).toContain('job_duration_seconds_bucket{job_type="chat2_outbox",le="0.05"} 1');
    expect(text).toContain('job_duration_seconds_bucket{job_type="chat2_outbox",le="+Inf"} 4');
    expect(text).toContain('job_duration_seconds_count{job_type="chat2_outbox"} 4');
    expect(text).not.toContain("eventId");
    expect(text).not.toContain("operationId");
    expect(text).not.toContain("conversationId");
    expect(text).not.toContain("errorCode");
    expect(metrics.render()).toBe(text);
  });
  it("sanitizes bad time input without leaking NaN to Prometheus", () => {
    const metrics = createChat2OutboxExecutionMetrics();
    metrics.record({ outcome: "retry", durationMs: Number.NaN, failureClass: "retryable" });
    expect(metrics.render()).toContain('job_duration_seconds_sum{job_type="chat2_outbox"} 0');
  });
  it("does not label counts with private message data", async () => {
    const text = renderChat2OutboxMetricsPrometheus(
      {
        pending: 7,
        dead: 2,
        leased: 1,
        oldest: new Date("2026-11-07T00:59:00Z"),
      },
      new Date("2026-11-07T01:00:00Z"),
    );
    expect(text).toContain("gafus_chat2_outbox_oldest_age_seconds 60");
    expect(text).toContain("gafus_chat2_outbox_pending 7");
    expect(text).not.toContain("conversationId");
  });
});
