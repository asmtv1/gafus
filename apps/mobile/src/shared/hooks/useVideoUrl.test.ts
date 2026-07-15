import { describe, expect, it } from "vitest";

import { resolveVideoUrlResponse } from "./videoUrlResponse";

describe("resolveVideoUrlResponse", () => {
  it("keeps the signed URL and video id on success", () => {
    expect(
      resolveVideoUrlResponse({
        success: true,
        data: { url: "https://api.gafus.ru/manifest.m3u8?token=secret", videoId: "video-1" },
      }),
    ).toEqual({
      url: "https://api.gafus.ru/manifest.m3u8?token=secret",
      videoId: "video-1",
      error: null,
    });
  });

  it("does not hide API errors when URL data is missing", () => {
    expect(
      resolveVideoUrlResponse({
        success: false,
        code: "FORBIDDEN",
        error: "Недостаточно прав для просмотра видео",
      }),
    ).toEqual({
      url: null,
      videoId: null,
      error: "Недостаточно прав для просмотра видео",
    });
  });

  it("uses a fallback error for an invalid successful response", () => {
    expect(resolveVideoUrlResponse({ success: true })).toEqual({
      url: null,
      videoId: null,
      error: "Не удалось получить URL видео",
    });
  });
});
