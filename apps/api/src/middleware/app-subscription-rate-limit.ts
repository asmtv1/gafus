const RATE_LIMITED_APP_SUBSCRIPTION_MUTATIONS = new Set([
  "/api/v1/app-subscription/yookassa/start",
  "/api/v1/app-subscription/yookassa/cancel",
  "/api/v1/app-subscription/apple/verify",
  "/api/v1/app-subscription/apple/restore",
]);

export function shouldRateLimitAppSubscriptionPath(method: string, pathname: string): boolean {
  return method.toUpperCase() === "POST" && RATE_LIMITED_APP_SUBSCRIPTION_MUTATIONS.has(pathname);
}
