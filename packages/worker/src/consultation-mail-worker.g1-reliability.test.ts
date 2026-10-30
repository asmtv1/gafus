/**
 * AG1-WORK070: actual BullMQ worker handler using injected Core transport.
 * All transport and queue state in-memory; NO Redis, PG or email service.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  core: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  workerHandler: null as null | ((job: { data: { emailLogId: string } }) => Promise<void>),
  queueName: "",
  workerOptions: null as null | { concurrency: number },
  onError: null as null | ((error: Error) => void),
}));
vi.mock("@gafus/queues", () => ({ connection: {} }));
vi.mock("@gafus/core/services/consultation", () => ({
  processConsultationEmailLog: m.core,
}));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => ({
    warn: m.warn, error: m.error, success: m.success,
  }),
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(
      name: string,
      handler: (job: { data: { emailLogId: string } }) => Promise<void>,
      options: { concurrency: number },
    ) {
      m.queueName = name;
      m.workerHandler = handler;
      m.workerOptions = options;
    }
    on(event: string, fn: (error: Error) => void) {
      if (event === "error") m.onError = fn;
      return this;
    }
  },
}));
import { startConsultationMailWorker } from "./consultation-mail-worker";
const handle = async (id: string) => {
  if (!m.workerHandler) throw new Error("WORKER_NOT_REGISTERED");
  return m.workerHandler({ data: { emailLogId: id } });
};
beforeEach(() => {
  vi.resetAllMocks();
  m.workerHandler = null;
  m.queueName = "";
  m.workerOptions = null;
  m.onError = null;
  m.core.mockResolvedValue("sent");
});
describe("AG1-WORK070 actual consultation-mail worker handler", () => {
  it("registers actual BullMQ name/concurrency and passes DB log ID, not booking ID", async () => {
    startConsultationMailWorker();
    expect(m.queueName).toBe("consultation-mail");
    expect(m.workerOptions).toEqual(expect.objectContaining({ concurrency: 2 }));
    await handle("log-A");
    expect(m.core).toHaveBeenCalledExactlyOnceWith("log-A");
  });
  it("two concurrent jobs for same log ID must not perform two Core send attempts", async () => {
    startConsultationMailWorker();
    let release: ((value: "sent") => void) | undefined;
    m.core.mockImplementationOnce(() => new Promise<"sent">((resolve) => {
      release = resolve;
    }));
    const a = handle("log-A");
    const b = handle("log-A");
    expect(m.core).toHaveBeenCalledTimes(1);
    release?.("sent");
    await Promise.all([a, b]);
    expect(m.core).toHaveBeenCalledTimes(1);
  });
  it("two overlapping pre-ACK failures both reject; retry begins a fresh Core attempt", async () => {
    startConsultationMailWorker();
    let reject!: (error: Error) => void;
    m.core.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const a = handle("log-A");
    const b = handle("log-A");
    expect(m.core).toHaveBeenCalledTimes(1);
    const fault = new Error("SYNTHETIC_NETWORK_BEFORE_ACK");
    reject(fault);
    const results = await Promise.allSettled([a, b]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(results.every((r) => r.status === "rejected" && r.reason === fault)).toBe(true);
    await expect(handle("log-A")).resolves.toBeUndefined();
    expect(m.core).toHaveBeenCalledTimes(2);
  });
  it("worker error event must not log provider stack or secret", () => {
    startConsultationMailWorker();
    const secret = "SYNTHETIC_WORKER_CONNECTION_PRIVATE_PASSWORD";
    const err = new Error(secret);
    err.stack = "PRIVATE_WORKER_STACK";
    m.onError?.(err);
    const logs = m.error.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg)
    ).join(" ");
    expect(m.error).toHaveBeenCalledTimes(1);
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain("PRIVATE_WORKER_STACK");
  });

  it("different log identities remain independent, not globally serial", async () => {
    startConsultationMailWorker();
    const a = handle("log-A");
    const b = handle("log-B");
    await Promise.all([a, b]);
    expect(m.core.mock.calls).toEqual([["log-A"], ["log-B"]]);
  });
  it("transient pre-ACK error rejects job and allows later retry of same log", async () => {
    startConsultationMailWorker();
    m.core.mockRejectedValueOnce(new Error("SYNTHETIC_NETWORK_BEFORE_PROVIDER_ACK"));
    await expect(handle("log-A")).rejects.toThrow("SYNTHETIC_NETWORK_BEFORE_PROVIDER_ACK");
    await expect(handle("log-A")).resolves.toBeUndefined();
    expect(m.core).toHaveBeenCalledTimes(2);
  });
  it("duplicate completed job invokes Core's persistent already-sent guard", async () => {
    startConsultationMailWorker();
    m.core.mockResolvedValueOnce("sent").mockResolvedValueOnce("already-sent");
    await handle("log-A");
    await handle("log-A");
    expect(m.core).toHaveBeenCalledTimes(2);
  });
  it("missing DB log only warns and never triggers second delivery attempt", async () => {
    startConsultationMailWorker();
    m.core.mockResolvedValueOnce("missing");
    await handle("log-unknown");
    expect(m.warn).toHaveBeenCalledOnce();
    expect(m.core).toHaveBeenCalledOnce();
  });
});
