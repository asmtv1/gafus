import { describe, expect, it, vi } from "vitest";
import {
  withGafusAdminRows,
  type GafusAdminRowsPort,
} from "./adminRowsPort";

describe("Gafus admin SQL port (transaction binding)", () => {
  it("fails closed without a persistence binding, never fabricates a row", () => {
    const action = vi.fn(async () => "unreachable");
    expect(() => withGafusAdminRows(action)).toThrow("GAFUS_ADMIN_ROWS_PORT_UNBOUND");
    expect(action).not.toHaveBeenCalled();
  });
  it("preserves the actual transaction object, timeout options and SQL failure", async () => {
    const tx = { rawTx: { samePgTransaction: true } };
    const transaction = vi.fn(async (action: (rows: typeof tx) => Promise<unknown>) => action(tx));
    const port: GafusAdminRowsPort = {
      withTransaction: (action, options) => transaction(action, options) as ReturnType<typeof action>,
    };
    const operation = vi.fn(async (rows: unknown) => rows);
    await expect(withGafusAdminRows(operation, { maxWait: 10000, timeout: 30000 }, port))
      .resolves.toBe(tx);
    expect(operation).toHaveBeenCalledExactlyOnceWith(tx);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10000, timeout: 30000 });
    transaction.mockRejectedValueOnce(new Error("SQL_ROLLBACK"));
    await expect(withGafusAdminRows(async () => null, undefined, port)).rejects.toThrow("SQL_ROLLBACK");
  });
});
