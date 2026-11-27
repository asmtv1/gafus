import { afterEach, describe, expect, it, vi } from "vitest";
import { allowQuestionsS3Fallback, probeCdnOutage } from "./index";

const key = "/questions/uploads/questions/v2/owner/01234567-89ab-4def-8123-456789abcdef/v1/image/s.webp";
const cdn = "https://cdn.gafus.ru" + key;
const backup = "https://gafus-questions-public.s3.cloud.ru" + key;

afterEach(() => vi.useRealTimers());
describe("bounded CDN status probes", () => {
  it.each([false, true])("settles when fetch ignores abort (native=%s)", async nativeNetwork => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const pending = probeCdnOutage(cdn, { fetcher, nativeNetwork, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBe(nativeNetwork);
  });
  it("coalesces only matching in-flight requests, not subsequent authorization decisions", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const a = allowQuestionsS3Fallback(cdn, backup, fetcher);
    const b = allowQuestionsS3Fallback(cdn, backup, fetcher);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledOnce();
    finish(new Response(null, { status: 503 }));
    await expect(Promise.all([a,b])).resolves.toEqual([true,true]);
    const next = allowQuestionsS3Fallback(cdn, backup, fetcher);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    finish(new Response(null, { status: 403 }));
    await expect(next).resolves.toBe(false);
  });
  it("separates web and native policies and never probes an unrelated backup", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    await expect(Promise.all([
      allowQuestionsS3Fallback(cdn, backup, fetcher),
      allowQuestionsS3Fallback(cdn, backup, fetcher, true),
    ])).resolves.toEqual([false, true]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(allowQuestionsS3Fallback(cdn, backup.replace("/s.webp","/m.webp"), fetcher, true)).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
