import { describe, expect, it, vi } from "vitest";
import { listGafusFraudSignalsAdmin } from "./index";
import type { GafusAdminRows, GafusAdminRowsPort } from "./adminRowsPort";

/** There must be no registry bootstrap or mutable process-wide binding here. */
describe("Gafus admin explicit transaction composition", () => {
  it("does not mix separate application instances or borrow one global SQL provider", async () => {
    const make = (marker: string) => {
      const actorRole = vi.fn().mockResolvedValue({ role: "ADMIN" });
      const listFraudSignals = vi.fn().mockResolvedValue([{ id: marker }]);
      const rows = { actorRole, listFraudSignals } as unknown as GafusAdminRows;
      const withTransaction: GafusAdminRowsPort["withTransaction"] = async (fn) => fn(rows);
      return { port: { withTransaction }, actorRole, listFraudSignals };
    };
    const a = make("a"), b = make("b");
    expect(await listGafusFraudSignalsAdmin({ actorId: "admin-a" }, a.port))
      .toEqual([{ id: "a" }]);
    expect(await listGafusFraudSignalsAdmin({ actorId: "admin-b" }, b.port))
      .toEqual([{ id: "b" }]);
    expect(await listGafusFraudSignalsAdmin({ actorId: "admin-a" }, a.port))
      .toEqual([{ id: "a" }]);
    expect(a.actorRole).toHaveBeenCalledTimes(2);
    expect(b.actorRole).toHaveBeenCalledTimes(1);
    expect(a.listFraudSignals).toHaveBeenCalledTimes(2);
    expect(b.listFraudSignals).toHaveBeenCalledTimes(1);
  });
});
