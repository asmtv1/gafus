/** Match the original Mobile pending-post recovery cadence. */
export function mobilePendingRefreshInterval(
  items: readonly { status: string }[] | null | undefined,
): number {
  return items?.some(item => item.status === "pending") ? 5_000 : 20_000;
}
