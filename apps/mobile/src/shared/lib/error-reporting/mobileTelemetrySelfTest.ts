import type { User } from "@/shared/lib/api";

import type { ClientErrorData } from "./types";

type ReportClientError = (error: unknown, data?: ClientErrorData) => Promise<void>;

export function canSendMobileTelemetrySelfTest(user: User | null | undefined) {
  return typeof user?.username === "string" && user.username.trim().toLowerCase() === "admin";
}

export function sendMobileTelemetrySelfTest(reportClientError: ReportClientError): Promise<void> {
  return reportClientError(new Error("MobileTelemetrySelfTest"), {
    issueKey: "MobileTelemetrySelfTest",
    severity: "error",
    keys: {
      source: "profile_admin_button",
    },
  });
}
