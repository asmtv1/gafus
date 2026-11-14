import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { npdConnection: mocks } }));
import { applyNpdFiscalizationCutover } from "./npdCutoverService";
describe("explicit NPD cutover state transition", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not cut over an unbootstrapped connection", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(applyNpdFiscalizationCutover()).rejects.toThrow("not bootstrapped");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("is idempotent when already set", async () => {
    const past = new Date("2026-10-01T00:00:00Z");
    mocks.findUnique.mockResolvedValue({ fiscalizationStartedAt: past });
    expect(await applyNpdFiscalizationCutover()).toEqual(past);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("uses a compare-and-set against concurrent cutovers", async () => {
    const now = new Date("2026-10-11T00:00:00Z");
    mocks.findUnique.mockResolvedValue({ fiscalizationStartedAt: null });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    expect(await applyNpdFiscalizationCutover(now)).toEqual(now);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "default", fiscalizationStartedAt: null },
      data: { fiscalizationStartedAt: now },
    });
  });
  it("returns the concurrent winner's recorded timestamp", async () => {
    const existing = new Date("2026-10-10T00:00:00Z");
    mocks.findUnique.mockResolvedValueOnce({ fiscalizationStartedAt: null })
      .mockResolvedValueOnce({ fiscalizationStartedAt: existing });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await applyNpdFiscalizationCutover()).toEqual(existing);
  });
});
