import { describe, expect, it, vi } from "vitest";
const captured = vi.hoisted(() => ({ bound: vi.fn(), transaction: vi.fn() }));
vi.mock("@gafus/gafus-server/admin-rows", () => ({ withGafusAdminRows: captured.transaction }));

describe("Gafus admin rows SQL composer", () => {
  it("uses the adapter's original single transaction with unchanged options", async () => {
    const token = { rawTx: { sameConnection: "pg-1" } };
    captured.transaction.mockImplementationOnce(async (action, options) => {
      expect(options).toEqual({ maxWait: 10000, timeout: 30000 });
      return action(token);
    });
    const { adminRows: port } = await import("./admin-rows-instance");
    const action = vi.fn(async (rows) => rows);
    await expect(port.withTransaction(action, { maxWait: 10000, timeout: 30000 })).resolves.toBe(token);
    expect(action).toHaveBeenCalledExactlyOnceWith(token);
    expect(captured.transaction).toHaveBeenCalledTimes(1);
  });
});
