import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PromoError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AppSubscriptionPromoCodeDomainError";
    }
  }
  return {
    getServerSession: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    revalidatePath: vi.fn(),
    PromoError,
  };
});

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  AppSubscriptionPromoCodeDomainError: mocks.PromoError,
  createAppSubscriptionPromoCode: mocks.create,
  updateAppSubscriptionPromoCode: mocks.update,
  archiveAppSubscriptionPromoCode: mocks.archive,
}));
vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

import {
  archiveAppSubscriptionPromoCodeAction,
  createAppSubscriptionPromoCodeAction,
  updateAppSubscriptionPromoCodeAction,
} from "./appSubscriptionPromoCodeActions";

const createPayload = { code: "Kisa", discountPercent: 10, isActive: true };
const updatePayload = { id: "promo-1", discountPercent: 20, isActive: false };

describe("app subscription promo code admin actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated direct mutation calls", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(createAppSubscriptionPromoCodeAction(createPayload)).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    ["MODERATOR", updateAppSubscriptionPromoCodeAction, updatePayload, mocks.update],
    ["USER", archiveAppSubscriptionPromoCodeAction, { id: "promo-1" }, mocks.archive],
  ])("keeps %s read-only", async (role, action, payload, mutation) => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "viewer-1", role } });

    await expect(action(payload)).resolves.toEqual({
      success: false,
      error: "Изменять промокоды может только ADMIN",
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("validates unknown input before calling the domain", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });

    await expect(
      createAppSubscriptionPromoCodeAction({ ...createPayload, discountPercent: 51 }),
    ).resolves.toMatchObject({ success: false, code: "VALIDATION_ERROR" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("passes the authenticated actor and revalidates after every successful mutation", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.create.mockResolvedValue({ id: "promo-1" });
    mocks.update.mockResolvedValue({ id: "promo-1" });
    mocks.archive.mockResolvedValue({ id: "promo-1" });

    await expect(createAppSubscriptionPromoCodeAction(createPayload)).resolves.toEqual({
      success: true,
    });
    await expect(updateAppSubscriptionPromoCodeAction(updatePayload)).resolves.toEqual({
      success: true,
    });
    await expect(archiveAppSubscriptionPromoCodeAction({ id: "promo-1" })).resolves.toEqual({
      success: true,
    });

    expect(mocks.create).toHaveBeenCalledWith({ ...createPayload, actorId: "admin-1" });
    expect(mocks.update).toHaveBeenCalledWith({ ...updatePayload, actorId: "admin-1" });
    expect(mocks.archive).toHaveBeenCalledWith({ id: "promo-1", actorId: "admin-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("returns a clear case-insensitive duplicate error", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.create.mockRejectedValue(
      new mocks.PromoError(
        "PROMO_CODE_DUPLICATE",
        "Промокод с таким кодом уже существует, включая архивные",
      ),
    );

    await expect(
      createAppSubscriptionPromoCodeAction({ ...createPayload, code: "kisa" }),
    ).resolves.toEqual({
      success: false,
      code: "PROMO_CODE_DUPLICATE",
      error: "Промокод с таким кодом уже существует, включая архивные",
    });
  });
});
