import { reportClientError } from "@/shared/lib/tracer";

const DEFAULT_WEB_HOST = "gafus.ru";

export function isPaymentSuccessReturnUrl(url: string, expectedHost = DEFAULT_WEB_HOST): boolean {
  try {
    const parsed = new URL(url);
    const paid = parsed.searchParams.get("paid");
    const from = parsed.searchParams.get("from");
    return (
      parsed.host === expectedHost &&
      parsed.pathname.startsWith("/trainings/") &&
      paid === "1" &&
      from === "app"
    );
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "paymentReturnUrl",
      severity: "warning",
      keys: { operation: "parse_return_url" },
    });
    return false;
  }
}
