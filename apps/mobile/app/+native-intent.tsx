/** Verify GAFUS app links; unknown native intents are left to the router. */
import { reportClientError } from "@/shared/lib/error-reporting";
import { nativePathForVerifiedGafusUrl } from "@/shared/lib/links/verifiedAppLinks";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (!path || typeof path !== "string") return path;
    const verified = nativePathForVerifiedGafusUrl(path);
    if (verified) return verified;
    return path;
  } catch (error) {
    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      issueKey: "nativeIntent",
      severity: "warning",
      keys: { operation: "redirect_system_path" },
    });
    return "/(auth)/welcome";
  }
}
