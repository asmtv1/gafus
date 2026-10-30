import { describe, expect, it, vi } from "vitest";
import { momentUploadPool } from "./momentUploadPool";

describe("browser Moments private S3 POST pool", () => {
  it("runs exactly five at once and preserves input order after out-of-order ACKs", async () => {
    const waiting: ((result: string) => void)[] = [];
    let active = 0, peak = 0;
    const upload = vi.fn((key: number) => {
      active++; peak = Math.max(active, peak);
      return new Promise<string>(resolve => { waiting[key] = result => {
        active--; resolve(result);
      }; });
    });
    const promise = momentUploadPool(Array.from({ length: 9 }, (_, i) => i), upload);
    expect(upload).toHaveBeenCalledTimes(5);
    expect(peak).toBe(5);
    waiting[3]!("id3");
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(6));
    waiting[1]!("id1");
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(7));
    waiting[4]!("id4");
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(8));
    waiting[2]!("id2");
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(9));
    for (const i of [8, 0, 6, 5, 7]) waiting[i]!(`id${i}`);
    expect(await promise).toEqual(Array.from({ length: 9 }, (_, i) => `id${i}`));
    expect(peak).toBe(5);
    expect(active).toBe(0);
  });
  it("drains active uploads and never dispatches queued files after a failure", async () => {
    const complete: ((ok: boolean) => void)[] = [];
    let active = 0;
    const transfer = vi.fn((index: number) => {
      active++;
      return new Promise<number>((resolve, reject) => {
        complete[index] = ok => {
          active--;
          if (ok) resolve(index);
          else reject(Error("S3 503"));
        };
      });
    });
    const run = momentUploadPool(Array.from({ length: 8 }, (_, i) => i), transfer);
    expect(transfer).toHaveBeenCalledTimes(5);
    complete[0]!(false);
    await vi.waitFor(() => expect(active).toBe(4));
    for (const i of [1, 2, 3, 4]) complete[i]!(true);
    await expect(run).rejects.toThrow("S3 503");
    expect(active).toBe(0);
    expect(transfer).toHaveBeenCalledTimes(5);
  });
  it("rejects an unsafe concurrency value and returns empty results without writes", async () => {
    const task = vi.fn();
    await expect(momentUploadPool([1], task, 6)).rejects.toThrow(RangeError);
    expect(await momentUploadPool([], task)).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });
});
