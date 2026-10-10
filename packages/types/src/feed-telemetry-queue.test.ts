import { describe, expect, it, vi } from "vitest";
import { FeedTelemetryQueue } from "./feed-telemetry-queue";

function fixtures() {
  let stored: string | null = null;
  const storage = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: string) => { stored = value; }),
  };
  return { storage, getStored: () => stored };
}

describe("portable Web/iOS/Android feed telemetry", () => {
  it("retries after network loss without changing eventId", async () => {
    const f = fixtures();
    let online = false;
    const delivered: string[] = [];
    const send = vi.fn(async (events: { eventId: string }[]) => {
      if (!online) throw new Error("offline");
      delivered.push(...events.map(event => event.eventId));
      return { accepted: events.length };
    });
    const q = new FeedTelemetryQueue(f.storage, send);
    q.enqueue({ eventId: "stable-event-id" });
    expect(await q.flush()).toBe(false);
    expect(q.size).toBe(1);
    online = true;
    expect(await q.flush()).toBe(true);
    expect(q.size).toBe(0);
    expect(delivered).toEqual(["stable-event-id"]);
    expect(send.mock.calls[0]![0][0]!.eventId).toBe(send.mock.calls[1]![0][0]!.eventId);
  });

  it("keeps Redis temporary-failure responses for a later retry", async () => {
    const f = fixtures();
    const send = vi.fn()
      .mockResolvedValueOnce({ accepted: 0, retryable: true })
      .mockResolvedValueOnce({ accepted: 1 });
    const q = new FeedTelemetryQueue(f.storage, send);
    q.enqueue({ eventId: "a" });
    expect(await q.flush()).toBe(false);
    expect(q.size).toBe(1);
    expect(await q.flush()).toBe(true);
    expect(q.size).toBe(0);
  });

  it("recovers pending event across cold restart and drops expired Redis snapshots", async () => {
    const f = fixtures();
    let clock = 1_000_000;
    const clockNow = () => clock;
    const first = new FeedTelemetryQueue(f.storage, async () => { throw new Error("no network"); }, clockNow);
    first.enqueue({ eventId: "restart-id" });
    await first.flush();
    const restarted = new FeedTelemetryQueue(f.storage, async events => ({ accepted: events.length }), clockNow);
    await restarted.restore();
    expect(restarted.size).toBe(1);
    expect(await restarted.flush()).toBe(true);
    expect(restarted.size).toBe(0);
    first.enqueue({ eventId: "expired" });
    await first.flush();
    clock += 15 * 60_000;
    const stale = new FeedTelemetryQueue(f.storage, async events => ({ accepted: events.length }), clockNow);
    await stale.restore();
    expect(stale.size).toBe(0);
  });

  it("serializes concurrent background/foreground flushes", async () => {
    const f = fixtures();
    let finish!: (result: { accepted: number }) => void;
    const send = vi.fn(() => new Promise<{ accepted: number }>(resolve => { finish = resolve; }));
    const q = new FeedTelemetryQueue(f.storage, send);
    q.enqueue({ eventId: "one" });
    const first = q.flush();
    const second = q.flush();
    expect(send).toHaveBeenCalledTimes(1);
    finish({ accepted: 1 });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(q.size).toBe(0);
  });
});
