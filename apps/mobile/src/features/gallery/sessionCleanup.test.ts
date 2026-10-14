import { expect, it, vi } from "vitest";

const { clearMemoryCache, clearDiskCache } = vi.hoisted(() => ({
  clearMemoryCache: vi.fn().mockResolvedValue(undefined),
  clearDiskCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("expo-image", () => ({ Image: { clearMemoryCache, clearDiskCache } }));

import { clearRegisteredGallerySession } from "@/shared/stores/galleryCleanupBridge";
import { useGallerySession } from "./session";

it("synchronously clears gallery tasks when auth triggers the registered cleanup", () => {
  const epoch = useGallerySession.getState().epoch;
  useGallerySession.setState({
    epoch,
    tasks: [{
      id: "pending-upload",
      owner: "user-a",
      filename: "picture.jpg",
      generation: 0,
      status: "sending",
    }],
  });

  clearRegisteredGallerySession();

  expect(useGallerySession.getState().tasks).toEqual([]);
  expect(useGallerySession.getState().epoch).toBe(epoch + 1);
  expect(clearMemoryCache).toHaveBeenCalled();
  expect(clearDiskCache).toHaveBeenCalled();
});
