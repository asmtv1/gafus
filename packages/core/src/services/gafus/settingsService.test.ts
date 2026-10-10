import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GafusTx } from "./types";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({ prisma: {} }));

import { DEFAULT_GAFUS_SETTINGS, getGafusSettingsTx } from "./settingsService";

function tx() {
  return { gafusSettings: { findUnique: mocks.findUnique } } as unknown as GafusTx;
}

describe("Gafus economy initial flags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("enables economy, earning and spending if no admin settings row exists", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const settings = await getGafusSettingsTx(tx());
    expect(DEFAULT_GAFUS_SETTINGS).toMatchObject({
      economyEnabled: true,
      earningEnabled: true,
      spendingEnabled: true,
    });
    expect(settings).toMatchObject({
      economyEnabled: true,
      earningEnabled: true,
      spendingEnabled: true,
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { key: "default" } });
  });

  it("preserves existing explicit administrator choices instead of silently re-enabling", async () => {
    mocks.findUnique.mockResolvedValue({
      ...DEFAULT_GAFUS_SETTINGS,
      revision: 5,
      economyEnabled: false,
      earningEnabled: false,
      spendingEnabled: false,
    });
    const settings = await getGafusSettingsTx(tx());
    expect(settings).toMatchObject({
      revision: 5,
      economyEnabled: false,
      earningEnabled: false,
      spendingEnabled: false,
    });
  });
});
