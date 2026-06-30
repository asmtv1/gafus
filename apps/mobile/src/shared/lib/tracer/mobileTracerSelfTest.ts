import type { User } from "@/shared/lib/api";

import type { ClientErrorData } from "./types";

type ReportClientError = (error: unknown, data?: ClientErrorData) => void;

export function canSendMobileTracerSelfTest(user: User | null | undefined) {
  return user?.username.trim().toLowerCase() === "admin";
}

export function sendMobileTracerSelfTest(reportClientError: ReportClientError): void {
  reportClientError(new Error("MobileTracerSelfTest"), {
    issueKey: "MobileTracerSelfTest",
    severity: "error",
    keys: {
      source: "profile_admin_button",
    },
  });
}
