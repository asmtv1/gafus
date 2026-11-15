import { describe, expect, it, vi } from "vitest";

import { canSendMobileTelemetrySelfTest, sendMobileTelemetrySelfTest } from "./mobileTelemetrySelfTest";
import type { User } from "@/shared/lib/api";

const baseUser: User = {
  id: "user-1",
  username: "user",
  phone: null,
  email: "user@example.com",
  role: "USER",
};

describe("mobile telemetry self-test", () => {
  it("is available only for the admin username", () => {
    expect(canSendMobileTelemetrySelfTest({ ...baseUser, username: "admin" })).toBe(true);
    expect(canSendMobileTelemetrySelfTest({ ...baseUser, username: "Admin" })).toBe(true);
    expect(canSendMobileTelemetrySelfTest({ ...baseUser, username: "trainer", role: "ADMIN" })).toBe(
      false,
    );
    expect(canSendMobileTelemetrySelfTest(null)).toBe(false);
    expect(canSendMobileTelemetrySelfTest(undefined)).toBe(false);
    expect(canSendMobileTelemetrySelfTest({ ...baseUser, username: " Admin " })).toBe(true);
  });

  it("does not crash on incomplete or malformed cached user data", () => {
    for (const username of [undefined, null, 123, ""]) {
      expect(canSendMobileTelemetrySelfTest({ ...baseUser, username } as unknown as User)).toBe(false);
    }
  });

  it("reports a tagged GAFUS telemetry self-test error", async () => {
    const reportClientError = vi.fn().mockResolvedValue(undefined);

    await sendMobileTelemetrySelfTest(reportClientError);

    expect(reportClientError).toHaveBeenCalledOnce();
    const [error, data] = reportClientError.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("MobileTelemetrySelfTest");
    expect(data).toEqual({
      issueKey: "MobileTelemetrySelfTest",
      severity: "error",
      keys: {
        source: "profile_admin_button",
      },
    });
  });
});
