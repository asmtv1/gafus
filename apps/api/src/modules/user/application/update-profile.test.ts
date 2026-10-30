import { describe, expect, it, vi } from "vitest";
import { createUpdateProfileApplication } from "./update-profile";

describe("AG1-001 profile application port (Core invariant not duplicated)", () => {
  it("forwards verified actor + validated input by identity, once, no new defaults", async () => {
    const persist = vi.fn().mockResolvedValue({
      userId: "owner-A", fullName: "Анна", city: null,
    });
    const app = createUpdateProfileApplication({ persist });
    const data = {
      fullName: "Анна", city: "", telegram: "", birthDate: "",
    };
    const result = await app.execute({ actorUserId: "owner-A", data });
    expect(persist).toHaveBeenCalledExactlyOnceWith("owner-A", data);
    expect(persist.mock.calls[0]?.[1]).toBe(data);
    expect(result).toEqual({ userId: "owner-A", fullName: "Анна", city: null });
  });

  it("omitted fields remain omitted; does not synthesize blank socials", async () => {
    const persist = vi.fn().mockResolvedValue({ userId: "owner-B" });
    const data = { city: "Казань" };
    const result = await createUpdateProfileApplication({ persist })
      .execute({ actorUserId: "owner-B", data });
    expect(persist).toHaveBeenCalledExactlyOnceWith("owner-B", { city: "Казань" });
    expect(result).toEqual({ userId: "owner-B" });
    expect(persist.mock.calls[0]?.[1]).not.toHaveProperty("telegram");
    expect(persist.mock.calls[0]?.[1]).not.toHaveProperty("birthDate");
  });

  it("Core failure propagates unchanged to existing route error mapping", async () => {
    const failure = new Error("SYNTHETIC_DB_FAILURE");
    const persist = vi.fn().mockRejectedValue(failure);
    const app = createUpdateProfileApplication({ persist });
    await expect(app.execute({ actorUserId: "owner-A", data: { about: "" } }))
      .rejects.toBe(failure);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
