import { describe, expect, it } from "vitest";
import { NEXT_PUBLIC_WEB_ROUTES, requiresOwnerFence } from "./routeAccess";
import { readPageTitle } from "./pageTitle";
import type { RoutePath } from "./location";

describe("route session scope", () => {
  it.each(["/", "/login", "/register", "/passwordReset", "/reset-password", "/profile/confirm-email", "/otmazki"] as const)(
    "keeps %s public even with connected feature flags", path => {
      expect(NEXT_PUBLIC_WEB_ROUTES.has(path)).toBe(true);
      expect(requiresOwnerFence(path,{showTrainingFlowOptIn:true})).toBe(false);
    },
  );
  it.each(["/profile/albums","/reminders","/walks","/chats","/chats/private-123","/cynologist-chat","/feed/hidden-authors","/feed/notifications"] as const)(
    "keeps a session generation fence on %s", path => expect(requiresOwnerFence(path)).toBe(true),
  );
  it.each(["/questions","/articles","/courses","/pets","/subscription","/profile"] as const)(
    "does not add an irreversible connected-flow fence to %s", path => {
      expect(NEXT_PUBLIC_WEB_ROUTES.has(path)).toBe(false);
      expect(requiresOwnerFence(path)).toBe(false);
    },
  );
  it("keeps private identifiers out of browser titles", () => {
    expect(readPageTitle("/profile","?username=secret-user")).toBe("Публичный профиль — Гафус");
    expect(readPageTitle("/chats/private-123" as RoutePath,"?token=secret")).toBe("Гафус");
  });
});
