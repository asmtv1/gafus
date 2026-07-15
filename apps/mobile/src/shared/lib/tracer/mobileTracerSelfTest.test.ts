import { describe, expect, it, vi } from "vitest";

import { canSendMobileTracerSelfTest, sendMobileTracerSelfTest } from "./mobileTracerSelfTest";
import type { User } from "@/shared/lib/api";

const baseUser: User = {
  id: "user-1",
  username: "user",
  phone: null,
  email: "user@example.com",
  role: "USER",
};

describe("mobile tracer self-test", () => {
  it("is available only for the admin username", () => {
    expect(canSendMobileTracerSelfTest({ ...baseUser, username: "admin" })).toBe(true);
    expect(canSendMobileTracerSelfTest({ ...baseUser, username: "Admin" })).toBe(true);
    expect(canSendMobileTracerSelfTest({ ...baseUser, username: "trainer", role: "ADMIN" })).toBe(
      false,
    );
    expect(canSendMobileTracerSelfTest(null)).toBe(false);
  });

  it("reports a tagged AppTracer self-test error", async () => {
    const reportClientError = vi.fn().mockResolvedValue(undefined);

    await sendMobileTracerSelfTest(reportClientError);

    expect(reportClientError).toHaveBeenCalledOnce();
    const [error, data] = reportClientError.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("MobileTracerSelfTest");
    expect(data).toEqual({
      issueKey: "MobileTracerSelfTest",
      severity: "error",
      keys: {
        source: "profile_admin_button",
      },
    });
  });
});
