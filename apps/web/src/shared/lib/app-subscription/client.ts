export async function fetchAppSubscriptionStatus() {
  const response = await fetch("/api/v1/app-subscription/status", { cache: "no-store" });
  return response.json();
}

export async function fetchAppSubscriptionOffer() {
  const response = await fetch("/api/v1/app-subscription/offer", { cache: "no-store" });
  return response.json();
}
