import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  assignment: vi.fn(async (_ownerId: string, _courseId: string) => false),
  role: vi.fn(async () => "ADMIN"),
}));
vi.mock("@gafus/entitlements-server/policy-reads", () => ({
  readAccessActorRole: db.role,
  hasCurrentPaidSubscription: vi.fn(async () => false),
  hasAssignedPrivateCourse: db.assignment,
  hasActiveGafusArticleAccess: vi.fn(async () => false),
}));
describe("API composition of private course policy reader", () => {
  it("never elevates a private course by admin role or paid subscription", async () => {
    const core=await import("./content-policy-instance");
    const course={id:"private-1",isPrivate:true,isPaid:true};
    await expect(core.resolveCourseEntitlement(course,"admin-1"))
      .resolves.toEqual({allowed:false,source:"DENIED"});
    expect(db.assignment).toHaveBeenCalledExactlyOnceWith("admin-1","private-1");
    expect(db.role).not.toHaveBeenCalled();
  });
});
