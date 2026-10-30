// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { navigate } from "../../shared/router/location";
describe("Chat2 profile compose navigation", () => {
  beforeEach(() => window.history.replaceState(null, "", "/profile?username=another"));
  afterEach(() => window.history.replaceState(null, "", "/"));
  it("allows only a validated user-handle compose deep link", () => {
    navigate("/chats?to=other_user" as Parameters<typeof navigate>[0]);
    expect(window.location.pathname).toBe("/chats");
    expect(window.location.search).toBe("?to=other_user");
  });
  it("rejects injected URLs, foreign hosts and unexpected query keys", () => {
    for (const bad of [
      "/chats?to=..",
      "/chats?to=admin%2Fapi",
      "/chats?to=admin&role=owner",
      "https://example.com/chats?to=admin",
      "/chats?to=admin#fragment",
      "/chats?to=1",
    ]) {
      expect(() => navigate(bad as Parameters<typeof navigate>[0])).toThrow("Invalid route");
      expect(window.location.pathname).toBe("/profile");
    }
  });
});
