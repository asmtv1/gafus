import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadTracerBatch } from "./tracerUpload";
import type { TracerUploadError } from "./tracerUpload";
import type { TracerPayloadItem } from "./types";

const payload = [] as TracerPayloadItem[];

describe("uploadTracerBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves only after AppTracer accepts the batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadTracerBatch(payload, "app-token")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sdk-api.apptracer.ru/api/crash/uploadBatch?crashToken=app-token&compressType=NONE&sdkVersion=2.6.5",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "[]",
      }),
    );
  });

  it("throws the AppTracer response message for a rejected batch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Null versionCode not allowed" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(uploadTracerBatch(payload, "app-token")).rejects.toEqual(
      expect.objectContaining<Partial<TracerUploadError>>({
        name: "TracerUploadError",
        message: "Null versionCode not allowed",
        status: 400,
      }),
    );
  });
});
