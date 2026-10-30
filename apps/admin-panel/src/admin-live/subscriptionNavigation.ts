/** Historical Next app-subscriptions query contract, safely normalized for Hono. */
export type SubscriptionTab = "payments" | "promo-codes" | "npd";
export const SUBSCRIPTIONS_ROUTE = "/main-panel/app-subscriptions";
const tabs = new Set<SubscriptionTab>(["payments", "promo-codes", "npd"]);
const statusPayments = new Set(["SUCCEEDED", "PENDING", "CANCELED", "FAILED", "REFUNDED"]);
const statusNpd = new Set([
  "PENDING", "ISSUED", "CANCEL_PENDING", "CANCELED", "RECONCILIATION_REQUIRED", "FAILED",
]);
const sizes = new Set(["10", "25", "50", "100"]);
const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
export function normalizedSubscriptionsSearch(search: string): string {
  const raw = new URLSearchParams(search);
  const out = new URLSearchParams();
  const requestedTab = raw.get("tab");
  const tab = tabs.has(requestedTab as SubscriptionTab) ? requestedTab! : "payments";
  out.set("tab", tab);
  if (tab === "promo-codes") {
    if (["1", "true"].includes(raw.get("includeArchived") ?? "")) {
      out.set("includeArchived", "1");
    }
  } else {
    const prefix = tab === "payments" ? "payment" : "npd";
    const p = raw.get(`${prefix}Page`);
    if (p && /^\d{1,5}$/.test(p) && Number(p) >= 1 && Number(p) <= 10000) {
      out.set(`${prefix}Page`, String(Number(p)));
    }
    const size = raw.get(`${prefix}PageSize`);
    if (size && sizes.has(size)) out.set(`${prefix}PageSize`, size);
    const status = raw.get(`${prefix}Status`);
    if (status && (tab === "payments" ? statusPayments : statusNpd).has(status)) {
      out.set(`${prefix}Status`, status);
    }
    const query = raw.get(`${prefix}Search`)?.trim();
    if (query) out.set(`${prefix}Search`, query.slice(0, 128));
    if (tab === "npd") {
      for (const key of ["npdFrom", "npdTo"]) {
        const day = raw.get(key);
        if (day && dateFormat.test(day) &&
            !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
            new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day) {
          out.set(key, day);
        }
      }
    }
  }
  return out.toString();
}
export function subscriptionTabFromSearch(search: string): SubscriptionTab {
  return new URLSearchParams(normalizedSubscriptionsSearch(search)).get("tab") as SubscriptionTab;
}
export function subscriptionTabUrl(tab: SubscriptionTab): string {
  if (!tabs.has(tab)) throw Error("Некорректная вкладка подписок");
  return `${SUBSCRIPTIONS_ROUTE}?tab=${tab}`;
}
export function subscriptionApiUrl(search: string): string {
  return `/api/v1/admin/app-subscriptions?${normalizedSubscriptionsSearch(search)}`;
}
