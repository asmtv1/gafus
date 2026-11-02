import { describe, expect, it, vi } from "vitest";
import {
  isCdnOutage, isSignedCdnFailoverActive, isTrustedCdnProbeUrl,
  MEDIA_CDN_OUTAGE_COOLDOWN_MS, probeCdnOutage,
} from "./index";

const host = "quepraquiecebquomiel.begetcdn.cloud";
const signed = (expires: number) =>
  `https://${host}/media/v2/asset1/v1/video/360.mp4?md5=ABCDEFGHIJKLMNOPQRSTUV&expires=${expires}`;

describe("CDN -> authenticated S3 fallback authorization contract", () => {
  it("does not interpret CDN permission denials as a storage outage", () => {
    for (const status of [400, 401, 403, 404, 429]) {
      expect(isCdnOutage({ status, timedOut: true, networkFailed: true })).toBe(false);
    }
    for (const status of [410, 500, 503, 504, 599]) {
      expect(isCdnOutage({ status })).toBe(true);
    }
  });

  it("rejects stale, too-distant, foreign-host and nonfinal signed video URLs", () => {
    const now = 1_793_600_000_000;
    const seconds = Math.floor(now / 1000);
    expect(isTrustedCdnProbeUrl(signed(seconds + 90), [host], now)).toBe(true);
    expect(isTrustedCdnProbeUrl(signed(seconds - 121), [host], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed(seconds + 172_801), [host], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed(seconds + 90).replace(host, "evil.example"), [host], now)).toBe(false);
    expect(isTrustedCdnProbeUrl(signed(seconds + 90).replace("video/360.mp4", "incoming/source.mp4"), [host], now)).toBe(false);
  });

  it("does not open a global failover circuit on 403/404 or CORS failures", async () => {
    const url = signed(Math.floor(Date.now() / 1000) + 180);
    const denied = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await probeCdnOutage(url, { fetcher: denied })).toBe(false);
    expect(isSignedCdnFailoverActive(url)).toBe(false);
    expect(await probeCdnOutage(url, {
      fetcher: vi.fn(async () => { throw new TypeError("opaque browser CORS"); }),
    })).toBe(false);
    expect(isSignedCdnFailoverActive(url)).toBe(false);
  });

  it("opens a bounded circuit only after an actual 503, then rechecks CDN after cooldown", async () => {
    const url = signed(Math.floor(Date.now() / 1000) + 180);
    const now = Date.now();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await probeCdnOutage(url, { fetcher })).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({
      method: "HEAD", credentials: "omit", cache: "no-store", redirect: "error",
    }));
    expect(isSignedCdnFailoverActive(url, now + 200)).toBe(true);
    expect(isSignedCdnFailoverActive(url, now + MEDIA_CDN_OUTAGE_COOLDOWN_MS + 1000)).toBe(false);
  });
});
