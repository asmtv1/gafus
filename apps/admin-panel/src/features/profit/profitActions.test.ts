import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  save: vi.fn(),
  cancel: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/appSubscription", () => ({
  saveProfitVideoExpense: mocks.save,
  cancelProfitVideoExpense: mocks.cancel,
}));
import { cancelVideoExpenseAction, saveVideoExpenseAction } from "./profitActions";

describe("profit action authorization", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([null, "USER", "PARTNER", "MODERATOR"])("rejects direct mutation by %s", async (role) => {
    mocks.session.mockResolvedValue(role ? { user: { id: "u", role } } : null);
    expect(await saveVideoExpenseAction({})).toMatchObject({ success: false });
    expect(await cancelVideoExpenseAction({ id: "expense", version: 1 })).toMatchObject({
      success: false,
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it("does not trust an actor ID or a client supplied amount", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    const input = { partnerId: "p", paidDay: "2026-09-18", quantity: 2, amountKopecks: 1 };
    expect(
      await saveVideoExpenseAction({
        actorId: "attacker",
        requestKey: "12345678-1234-1234-1234",
        input,
      }),
    ).toMatchObject({ success: true });
    expect(mocks.save).toHaveBeenCalledWith({
      actorId: "admin",
      requestKey: "12345678-1234-1234-1234",
      input: { partnerId: "p", paidDay: "2026-09-18", quantity: 2 },
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/main-panel/profit");
  });
  it("rejects fractional counts and masks database errors", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    expect(
      await saveVideoExpenseAction({
        requestKey: "12345678-1234-1234-1234",
        input: {
          partnerId: "p",
          paidDay: "2026-09-18",
          quantity: 1.5,
        },
      }),
    ).toMatchObject({ success: false });
    mocks.cancel.mockRejectedValue(new Error("database credential details"));
    const result = await cancelVideoExpenseAction({ id: "e", version: 1 });
    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).not.toContain("credential");
  });
});
