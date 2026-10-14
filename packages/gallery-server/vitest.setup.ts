import { vi } from "vitest";

// Install before importing the adapter or any workspace dependencies.
vi.mock("@gafus/queues", () => ({
  connection: { status: "ready", set: vi.fn() },
  enqueueGalleryProcessing: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
