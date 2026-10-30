import { describe, expect, it, vi } from "vitest";
import { createReadPublicProfileApplication } from "./read-public-profile.js";

describe("AG1-USER-020 public profile injected Core lookup", () => {
  it("forwards exact public username once without an authenticated actor", async () => {
    const profile = { username: "public-author", role: "USER", profile: null };
    const loadPublicProfile = vi.fn().mockResolvedValue(profile);
    const app = createReadPublicProfileApplication({ loadPublicProfile });
    const returned = await app.execute("public-author");
    expect(loadPublicProfile).toHaveBeenCalledExactlyOnceWith("public-author");
    expect(returned).toBe(profile);
  });

  it("keeps Core null unmodified for existing Hono 404", async () => {
    const loadPublicProfile = vi.fn().mockResolvedValue(null);
    const app = createReadPublicProfileApplication({ loadPublicProfile });
    expect(await app.execute("unknown-author")).toBeNull();
    expect(loadPublicProfile).toHaveBeenCalledExactlyOnceWith("unknown-author");
  });

  it("propagates original rejected error to Hono's masked 500", async () => {
    const fault = new Error("SYNTHETIC_PRIVATE_PROFILE_ERROR");
    const loadPublicProfile = vi.fn().mockRejectedValue(fault);
    const app = createReadPublicProfileApplication({ loadPublicProfile });
    await expect(app.execute("public-author")).rejects.toBe(fault);
    expect(loadPublicProfile).toHaveBeenCalledExactlyOnceWith("public-author");
  });
});
