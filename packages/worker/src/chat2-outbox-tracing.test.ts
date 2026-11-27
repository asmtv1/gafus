import { beforeEach, describe, expect, it, vi } from "vitest";
const trace = vi.hoisted(() => ({
  start: vi.fn(),
  run: vi.fn(),
  mark: vi.fn(),
  end: vi.fn(),
}));
vi.mock("@gafus/logger/server-telemetry", () => ({
  startCorrelatedSpan: trace.start,
  withServerSpan: trace.run,
  markServerSpanError: trace.mark,
}));
import { traceChat2DispatchStage, chat2DispatchTiming } from "./chat2-outbox-tracing";

beforeEach(() => {
  vi.clearAllMocks();
  trace.start.mockReturnValue({ end: trace.end });
  trace.run.mockImplementation(async (_span, fn: () => Promise<unknown>) => fn());
});

describe("Chat2 child spans in durable event context", () => {
  it("does not create a new root trace; propagates operationId and closes on ACK", async () => {
    const action = vi.fn().mockResolvedValue({ count: 1 });
    const result = await traceChat2DispatchStage("chat2.outbox.ack", "operation-123", action);
    expect(result).toEqual({ count: 1 });
    expect(trace.start).toHaveBeenCalledWith({
      service: "gafus-worker",
      name: "chat2.outbox.ack",
      kind: "internal",
      operationId: "operation-123",
    });
    expect(trace.run).toHaveBeenCalledOnce();
    expect(trace.end).toHaveBeenCalledOnce();
    expect(trace.mark).not.toHaveBeenCalled();
  });
  it("records a fixed error code, never sensitive broker error details", async () => {
    const privateFailure = new Error("SECRET_BROKER_FAILURE_user_42");
    await expect(
      traceChat2DispatchStage("chat2.outbox.publish", "operation-42", async () => {
        throw privateFailure;
      }),
    ).rejects.toBe(privateFailure);
    expect(trace.start).toHaveBeenCalledWith({
      service: "gafus-worker",
      name: "chat2.outbox.publish",
      kind: "client",
      operationId: "operation-42",
    });
    expect(trace.mark).toHaveBeenCalledWith(expect.anything(), "CHAT2_PUBLISH_STAGE_FAILED");
    expect(JSON.stringify(trace.mark.mock.calls)).not.toContain("SECRET_BROKER_FAILURE_user_42");
    expect(trace.end).toHaveBeenCalledOnce();
  });
});

describe("durable queue wait versus total event age",()=>{
  it("excludes deliberate backoff from ready-queue delay",()=>{
    expect(chat2DispatchTiming({createdAt:new Date(1000),nextAttemptAt:new Date(8000)},10000)).toEqual({
      "gafus.queue_wait_ms":2000,"gafus.event_age_ms":9000,
    });
  });
  it("never exports invalid, future or unbounded durations",()=>{
    expect(chat2DispatchTiming({createdAt:new Date(NaN),nextAttemptAt:new Date(20000)},10000)).toEqual({});
    expect(chat2DispatchTiming({createdAt:new Date(0),nextAttemptAt:new Date(0)},1_000_000_001)).toEqual({});
  });
});
