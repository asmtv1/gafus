import { describe, expect, it, vi } from "vitest";
import { formatOtaMegabytes, getOtaMainBundleBytes } from "./otaDownloadSize";

describe("OTA download size", () => {
  it("formats bytes in decimal megabytes", () => {
    expect(formatOtaMegabytes(10_450_000)).toMatch(/^10[,.]5$/);
    expect(formatOtaMegabytes(0)).toBeNull();
    expect(formatOtaMegabytes(Number.NaN)).toBeNull();
  });

  it("reads main bundle size with HEAD (no asset download)", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.method).toBe("HEAD");
      return { ok: true, headers: new Headers({ "content-length": "10450000" }) } as Response;
    });
    expect(await getOtaMainBundleBytes({
      launchAsset: { url: "https://assets.eascdn.net/bundle.hbc" },
    }, { fetcher: fetcher as unknown as typeof fetch })).toBe(10_450_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not invent size when metadata or headers are unavailable", async () => {
    expect(await getOtaMainBundleBytes({ assets: [] })).toBeNull();
    expect(await getOtaMainBundleBytes({ launchAsset: { url: "http://insecure.test" } }))
      .toBeNull();
    expect(await getOtaMainBundleBytes({ launchAsset: { url: "not-a-url" } }))
      .toBeNull();
    expect(await getOtaMainBundleBytes({ launchAsset: { url: "https://cdn.test/" } }, {
      fetcher: vi.fn(async () => ({ ok: true, headers: new Headers() }) as Response),
    })).toBeNull();
  });

  it("does not block updates on HEAD error", async () => {
    expect(await getOtaMainBundleBytes({
      launchAsset: { url: "https://assets.eascdn.net/bundle.hbc" },
    }, { fetcher: vi.fn(async () => { throw new Error("HEAD unsupported"); }) }))
      .toBeNull();
  });
});
