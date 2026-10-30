import { apiRequest } from "../../shared/api/client";

/** Browser-only Web Push; invoked directly from a user click, never at startup.
 * Does not install a PWA, intercept fetches, cache data or register on page load.
 */
export function browserPushSupported(): boolean {
  if (typeof window === "undefined" || !window.isSecureContext) return false;
  if (!("Notification" in window) || !("PushManager" in window) ||
      !("serviceWorker" in navigator)) return false;
  // iOS Safari in a normal browser tab does not offer Web Push. The user has
  // chosen native App Store installation, not Add to Home Screen/PWA.
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return false;
  return true;
}

function decodeVapidKey(key: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(key)) throw Error("INVALID_VAPID_PUBLIC_KEY");
  const padded = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(key.length / 4) * 4, "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length !== 65 || bytes[0] !== 4) throw Error("INVALID_VAPID_PUBLIC_KEY");
  return bytes;
}

function encodeKey(bytes: ArrayBuffer | null): string {
  if (!bytes) throw Error("MISSING_PUSH_KEYS");
  const view = new Uint8Array(bytes);
  if (!view.length) throw Error("MISSING_PUSH_KEYS");
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type ConnectedBrowserPush = { endpoint: string };

export async function connectBrowserPushOnUserGesture(
  currentOwner: () => string | undefined,
  expectedOwner: string,
): Promise<ConnectedBrowserPush> {
  if (!browserPushSupported()) throw Error("BROWSER_PUSH_UNSUPPORTED");
  // Must be called BEFORE the first await, while the click's user activation
  // is still in effect. Never trigger a browser prompt automatically.
  const permissionRequest = Notification.permission === "default" ?
    Notification.requestPermission() : Promise.resolve(Notification.permission);
  const permission = await permissionRequest;
  if (permission !== "granted") throw Error("BROWSER_PUSH_PERMISSION_DENIED");
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");

  const { publicKey } = await apiRequest<{ publicKey: string }>(
    "/api/v1/subscriptions/push/public-key",
    {method:"GET",browserAuth:true,expectedStatus:200},
  );
  const applicationServerKey = decodeVapidKey(publicKey);
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");

  // Explicitly requested push-only SW. Does not create a manifest or install UI.
  const registration = await navigator.serviceWorker.register("/push-sw.js", {
    scope: "/", updateViaCache: "none",
  });
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");
  await navigator.serviceWorker.ready;
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");
  const subscription = await registration.pushManager.getSubscription() ??
    await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
  if (!subscription.endpoint.startsWith("https://")) throw Error("INVALID_PUSH_ENDPOINT");
  const keys = {
    p256dh: encodeKey(subscription.getKey("p256dh")),
    auth: encodeKey(subscription.getKey("auth")),
  };
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");

  let postError: unknown;
  try {
    await apiRequest<unknown>("/api/v1/subscriptions/push",{
      method:"POST",json:{endpoint:subscription.endpoint,keys},
      browserAuth:true,expectedStatus:200,
    });
  } catch (error) { postError = error; }
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");
  // Even a successful HTTP POST is not sufficient. Confirm that this exact
  // endpoint belongs to the current authenticated owner (unknown ACK safe).
  const receipt = await apiRequest<{
    determined: boolean; hasThisDeviceSubscription: boolean;
  }>("/api/v1/subscriptions/push/device-status",{
    method:"POST",json:{endpoints:[subscription.endpoint]},
    browserAuth:true,expectedStatus:200,
  });
  if (currentOwner() !== expectedOwner) throw Error("OWNER_CHANGED");
  if (!receipt?.determined || receipt.hasThisDeviceSubscription !== true) {
    if (postError) throw postError;
    throw Error("PUSH_SUBSCRIPTION_UNCONFIRMED");
  }
  return {endpoint:subscription.endpoint};
}
