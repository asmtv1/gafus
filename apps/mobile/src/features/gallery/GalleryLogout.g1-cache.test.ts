import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const m = vi.hoisted(() => ({
  clearMemory: vi.fn().mockResolvedValue(undefined),
  clearDisk: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("expo-image", () => ({
  Image: { clearMemoryCache: m.clearMemory, clearDiskCache: m.clearDisk },
}));
import { registerGalleryClient, useGallerySession } from "./session";
import { clearRegisteredGallerySession } from "@/shared/stores/galleryCleanupBridge";
describe("logout clears only transient gallery signed/private data, preserves unrelated offline", () => {
  it("removes owner A/B gallery query payloads and upload tasks but retains offline key", async () => {
    m.clearMemory.mockClear();
    m.clearDisk.mockClear();
    const cache = new QueryClient();
    registerGalleryClient(cache);
    cache.setQueryData(["gallery", "A:E1", "alice", "album", "full", "photo"], {
      fullUrl: "https://cdn.example/private?sig=secret",
    });
    cache.setQueryData(["gallery", "B:E2", "bob", "albums"], {
      pages: [{ items: [{ coverThumbUrl: "https://cdn.example/secret" }] }],
    });
    cache.setQueryData(["offline-legacy", "course", "saved"], {
      progress: 50,
      data: "user's offline legacy content",
    });
    const oldEpoch = useGallerySession.getState().epoch;
    useGallerySession.setState({
      epoch: oldEpoch,
      tasks: [
        { id: "upload", owner: "A", filename: "private.png", generation: 0, status: "sending" },
      ],
    });
    clearRegisteredGallerySession();
    expect(useGallerySession.getState().tasks).toEqual([]);
    expect(useGallerySession.getState().epoch).toBe(oldEpoch + 1);
    expect(
      cache.getQueryData(["gallery", "A:E1", "alice", "album", "full", "photo"]),
    ).toBeUndefined();
    expect(cache.getQueryData(["gallery", "B:E2", "bob", "albums"])).toBeUndefined();
    expect(cache.getQueryData(["offline-legacy", "course", "saved"])).toEqual({
      progress: 50,
      data: "user's offline legacy content",
    });
    await vi.waitFor(() => expect(m.clearDisk).toHaveBeenCalledOnce());
    expect(m.clearMemory).toHaveBeenCalledOnce();
    cache.clear();
  });
});
