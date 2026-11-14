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
import { traceChat2DispatchStage } from "./chat2-outbox-tracing";

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
