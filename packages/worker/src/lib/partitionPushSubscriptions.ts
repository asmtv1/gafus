export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface SubscriptionLike {
  endpoint: string;
  keys: unknown;
}

function parseKeys(raw: unknown): PushSubscriptionKeys | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!("p256dh" in raw) || !("auth" in raw)) return null;

  const p256dh = (raw as { p256dh: unknown }).p256dh;
  const auth = (raw as { auth: unknown }).auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!p256dh || !auth) return null;

  return { p256dh, auth };
}

export function isExpoEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("ExponentPushToken[") || endpoint.startsWith("ExpoPushToken[");
}

export function isExpoSubscription(subscription: PushSubscriptionJSON): boolean {
  return subscription.keys.p256dh === "expo" || isExpoEndpoint(subscription.endpoint);
}

export function partitionPushSubscriptions(subscriptions: SubscriptionLike[]): {
  web: PushSubscriptionJSON[];
  expo: PushSubscriptionJSON[];
} {
  const normalized = subscriptions
    .map((subscription) => {
      const keys = parseKeys(subscription.keys);
      if (!keys || !subscription.endpoint) return null;
      return { endpoint: subscription.endpoint, keys };
    })
    .filter((subscription): subscription is PushSubscriptionJSON => subscription !== null);

  const web: PushSubscriptionJSON[] = [];
  const expo: PushSubscriptionJSON[] = [];

  for (const subscription of normalized) {
    if (isExpoSubscription(subscription)) {
      expo.push(subscription);
    } else {
      web.push(subscription);
    }
  }

  return { web, expo };
}
