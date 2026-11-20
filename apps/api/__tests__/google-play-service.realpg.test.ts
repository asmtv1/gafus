import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@gafus/prisma";

vi.mock("../src/modules/app-subscription/google-play-client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/modules/app-subscription/google-play-client.js")>();
  return {
    ...original,
    googlePlayConfigured: () => true,
    googlePlayPlans: () => [{ productId: "test_premium", basePlanId: "monthly", planCode: "MONTHLY" }],
    readGoogleSubscription: vi.fn(),
    acknowledgeGoogleSubscription: vi.fn(),
  };
});

import { acknowledgeGoogleSubscription, readGoogleSubscription } from "../src/modules/app-subscription/google-play-client";
import { prepareGooglePlay, syncGooglePlayPurchase } from "../src/modules/app-subscription/google-play-service";

const suite = process.env.GAFUS_GOOGLE_PLAY_TEST_ISOLATED === "1" ? describe : describe.skip;

suite("Google Play with isolated PostgreSQL and a mocked Publisher API", () => {
  let owner: string;
  let stranger: string;
  let accountId: string;
  const purchase = (overrides = {}) => ({
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE" as const,
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" as const,
    startTime: new Date().toISOString(),
    externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
    lineItems: [{
      productId: "test_premium", offerDetails: { basePlanId: "monthly" },
      expiryTime: new Date(Date.now() + 86400_000).toISOString(),
      autoRenewingPlan: { autoRenewEnabled: true },
    }],
    ...overrides,
  });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/gafus_refactor_google_isolated_"))
      throw new Error("Google Play test requires its dedicated temporary database");
    owner = (await prisma.user.create({ data: { username: "google-owner", password: "unused" } })).id;
    stranger = (await prisma.user.create({ data: { username: "google-stranger", password: "unused" } })).id;
    accountId = (await prepareGooglePlay(owner)).accountId!;
    expect((await prepareGooglePlay(owner)).accountId).toBe(accountId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("binds once across concurrent calls and denies cross-account replay", async () => {
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase());
    vi.mocked(acknowledgeGoogleSubscription).mockResolvedValue(undefined);
    await expect(syncGooglePlayPurchase("bad-owner", stranger)).rejects.toThrow("OWNER_MISMATCH");
    const results = await Promise.all([
      syncGooglePlayPurchase("test-first", owner),
      syncGooglePlayPurchase("test-first", owner),
      syncGooglePlayPurchase("test-first"),
    ]);
    expect(results).toEqual(Array(3).fill({ entitled: true, pending: false }));
    expect(await prisma.appSubscription.count({ where: { googlePlayPurchaseToken: "test-first" } })).toBe(1);
    await expect(syncGooglePlayPurchase("test-first", stranger)).rejects.toThrow("OWNER_MISMATCH");
    expect(acknowledgeGoogleSubscription).toHaveBeenCalledWith("test_premium", "test-first");
  });

  it("stores pending without access, reconciles cancellation and replaces the old token", async () => {
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase());
    await syncGooglePlayPurchase("test-predecessor", owner);
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase({
      subscriptionState: "SUBSCRIPTION_STATE_PENDING", startTime: undefined, linkedPurchaseToken: "test-predecessor",
    }));
    expect(await syncGooglePlayPurchase("test-next", owner)).toEqual({ pending: true, entitled: false });
    expect(await prisma.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: "test-predecessor" }, select: { status: true },
    })).toEqual({ status: "ACTIVE" });

    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase({ linkedPurchaseToken: "test-predecessor" }));
    expect(await syncGooglePlayPurchase("test-next")).toEqual({ entitled: true, pending: false });
    expect(await prisma.appSubscription.findUnique({
      where: { googlePlayPurchaseToken: "test-predecessor" }, select: { status: true },
    })).toEqual({ status: "REVOKED" });
    expect(await syncGooglePlayPurchase("test-predecessor", owner)).toEqual({ entitled: false, pending: false });

    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase({
      subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
    }));
    expect(await syncGooglePlayPurchase("test-next")).toEqual({ entitled: true, pending: false });
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase({
      subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
    }));
    expect(await syncGooglePlayPurchase("test-next")).toEqual({ entitled: false, pending: false });
  });

  it("does not grant access when an earlier token arrives after its replacement", async () => {
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase({ linkedPurchaseToken: "test-late-original" }));
    expect(await syncGooglePlayPurchase("test-new-first", owner)).toEqual({ entitled: true, pending: false });
    vi.mocked(readGoogleSubscription).mockResolvedValue(purchase());
    expect(await syncGooglePlayPurchase("test-late-original", owner)).toEqual({ entitled: false, pending: false });
  });
});
