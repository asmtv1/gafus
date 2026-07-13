import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadAction = vi.hoisted(() => vi.fn());

vi.mock("@features/trainer-videos/lib/uploadTrainerVideoAction", () => ({
  uploadTrainerVideoStreamAction: uploadAction,
}));

vi.mock("@features/trainer-videos/lib/uploadLimits", () => ({
  MAX_TRAINER_VIDEO_SIZE_BYTES: 3 * 1024 * 1024 * 1024,
}));

import { POST } from "./route";

const TWO_POINT_ONE_GIB = Math.ceil(2.1 * 1024 * 1024 * 1024);
const THREE_GIB = 3 * 1024 * 1024 * 1024;

describe("POST trainer video upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a single 2.1 GiB raw video stream", async () => {
    uploadAction.mockResolvedValue({ success: true, video: { id: "video-1" }, status: 201 });
    const request = new Request("http://localhost/main-panel/my-videos/upload", {
      method: "POST",
      headers: {
        "content-length": String(TWO_POINT_ONE_GIB),
        "content-type": "video/mp4",
        "x-file-name": encodeURIComponent("large-video.mp4"),
      },
      body: new Uint8Array([1]),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(uploadAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "large-video.mp4",
        mimeType: "video/mp4",
        size: TWO_POINT_ONE_GIB,
      }),
    );
  });

  it("rejects a payload larger than 3 GiB before reading the body", async () => {
    const request = new Request("http://localhost/main-panel/my-videos/upload", {
      method: "POST",
      headers: {
        "content-length": String(THREE_GIB + 1),
        "content-type": "video/mp4",
        "x-file-name": encodeURIComponent("too-large.mp4"),
      },
      body: new Uint8Array([1]),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(uploadAction).not.toHaveBeenCalled();
  });
});
