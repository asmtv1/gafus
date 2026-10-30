import { describe, expect, it, vi } from "vitest";
import { createReadProfileApplication } from "./read-profile";

describe("AG1-001 GET profile application nullable Core result classification", () => {
  it("found: forwards verified actor to Core exactly once, keeps DTO identity", async () => {
    const profile = {
      id: "owner-A", username: "a", role: "USER",
      phone: null, email: "private@example.invalid", hasAppPassword: false,
      hasVkLinked: false, onboardingTourCompletedAt: null,
      profile: {
        fullName: null, city: "Казань", about: null, telegram: null,
        instagram: null, website: null, birthDate: null, avatarUrl: null,
      },
    };
    const loadProfile = vi.fn().mockResolvedValue(profile);
    const application = createReadProfileApplication({ loadProfile });
    const result = await application.execute({ actorUserId: "owner-A" });
    expect(loadProfile).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(result).toEqual({ kind: "found", profile });
    expect(result.kind === "found" && result.profile === profile).toBe(true);
  });

  it("missing: maps only null to not_found without new DB access", async () => {
    const loadProfile = vi.fn().mockResolvedValue(null);
    const application = createReadProfileApplication({ loadProfile });
    expect(await application.execute({ actorUserId: "deleted-user" }))
      .toEqual({ kind: "not_found" });
    expect(loadProfile).toHaveBeenCalledExactlyOnceWith("deleted-user");
  });

  it("unexpected Core exception remains same rejection to the Hono 500 mapper", async () => {
    const fault = new Error("SYNTHETIC_PRIVATE_SQL_ERROR");
    const loadProfile = vi.fn().mockRejectedValue(fault);
    const application = createReadProfileApplication({ loadProfile });
    await expect(application.execute({ actorUserId: "owner-A" }))
      .rejects.toBe(fault);
    expect(loadProfile).toHaveBeenCalledExactlyOnceWith("owner-A");
  });
});
