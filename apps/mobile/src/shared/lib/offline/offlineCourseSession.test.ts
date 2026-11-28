import { beforeEach, describe, expect, it } from "vitest";
import { cachedCredentialOwnsCourses, captureOfflineCourseScope, setOfflineCoursePrincipal } from "./offlineCourseSession";

beforeEach(() => setOfflineCoursePrincipal(null));

describe("offline course ownership", () => {
  it("only reopens the local principal whose subject matches the stored credential", () => {
    const token = `header.${btoa(JSON.stringify({ sub: "owner-A" }))}.signature`;
    expect(cachedCredentialOwnsCourses(token, "owner-A")).toBe(true);
    expect(cachedCredentialOwnsCourses(token, "owner-B")).toBe(false);
    expect(cachedCredentialOwnsCourses("malformed", "owner-A")).toBe(false);
  });
  it("never promotes a cached principal to a writable session", () => {
    setOfflineCoursePrincipal("owner-A", false);
    const scope = captureOfflineCourseScope()!;
    expect(scope.isCurrent()).toBe(true);
    expect(scope.canWrite()).toBe(false);
    setOfflineCoursePrincipal("owner-A", true);
    expect(scope.canWrite()).toBe(true);
  });
  it("invalidates old work even if the same principal signs in again", () => {
    setOfflineCoursePrincipal("owner-A", true);
    const scope = captureOfflineCourseScope()!;
    setOfflineCoursePrincipal(null);
    setOfflineCoursePrincipal("owner-A", true);
    expect(scope.isCurrent()).toBe(false);
    expect(scope.canWrite()).toBe(false);
  });
});
