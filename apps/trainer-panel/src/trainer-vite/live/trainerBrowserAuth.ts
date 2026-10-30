/** Browser-cookie transport, no JWT/localStorage/sessionStorage or URL secrets. */
import { z } from "zod/v3";
import type { PanelActor } from "../consultationContract";

const actorSchema = z.object({
  id: z.string().min(1).max(128), username: z.string(),
  role: z.enum(["GUEST", "USER", "PARTNER", "TRAINER", "MODERATOR", "ADMIN"]),
}).strict();
const meSchema = z.object({ success: z.literal(true), data: actorSchema }).strict();
const loginSchema = z.object({
  success: z.literal(true), data: z.object({ user: actorSchema }).strict(),
}).strict();
export type BrowserActor = z.infer<typeof actorSchema>;
export type BrowserSession = {
  actor: PanelActor;
  username: string;
  // An ephemeral internal *opaque witness*, NOT a real access token.
  witness: string;
  epoch: string;
};

const ALLOWED_PATH = new RegExp(
  String.raw`^/api/v1/(?:trainer/[a-z0-9/_-]+|consultations/trainer/[a-z0-9/_-]+|consultations/bookings/[a-zA-Z0-9_-]{1,128}/voximplant/(?:prepare|sign|admission))` +
  String.raw`(?:\?[a-zA-Z0-9=&%._-]*)?$`,
);
export function validatedTrainerApiPath(path: string): string {
  if (typeof path !== "string" || !ALLOWED_PATH.test(path) || path.includes("..") ||
      /%(?:2f|5c|2e|00)/i.test(path)) throw Error("UNTRUSTED_TRAINER_API_PATH");
  return path;
}

/** Compatibility adapter for legacy proposed Bearer consumers.
 * It discards their synthetic witness and authenticates only via HttpOnly cookie.
 * It NEVER forwards fabricated Authorization to Hono or another host.
 */
export function createTrainerCookieFetch(
  original: typeof fetch,
  onUnauthorized: () => void,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input !== "string") throw Error("UNSUPPORTED_TRAINER_REQUEST");
    const path = validatedTrainerApiPath(input);
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    headers.set("X-Gafus-Auth-Transport", "cookie");
    const result = await original(path, {
      ...init, headers, credentials: "include", cache: "no-store",
    });
    if (result.status === 401) onUnauthorized();
    return result;
  }) as typeof fetch;
}

export async function readTrainerApiEnvelope(
  request: typeof fetch, path: string, signal: AbortSignal,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const response = await request(validatedTrainerApiPath(path), { signal, method: "GET" });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  return {
    status: response.status,
    headers: {
      "cache-control": response.headers.get("cache-control") ?? "",
      "referrer-policy": response.headers.get("referrer-policy") ?? "",
    }, body,
  };
}

export async function mutateTrainerApiEnvelope(
  request: typeof fetch,
  input: { method: "POST" | "PUT" | "DELETE"; path: string;
    body?: unknown; signal: AbortSignal },
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const headers = new Headers();
  if (input.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await request(validatedTrainerApiPath(input.path), {
    method: input.method, signal: input.signal, headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  return {
    status: response.status,
    headers: { "cache-control": response.headers.get("cache-control") ?? "" },
    body,
  };
}

export async function trainerMe(request: typeof fetch): Promise<BrowserActor | null> {
  const me = () => request("/api/v1/auth/me", { method: "GET", credentials: "include",
    cache: "no-store" });
  let response = await me();
  if (response.status === 401) {
    const refresh = await request("/api/v1/auth/refresh", {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Gafus-Auth-Transport": "cookie" },
      body: "{}",
    });
    if ([400, 401, 403].includes(refresh.status)) return null;
    if (!refresh.ok) throw Error("SESSION_REFRESH_UNKNOWN");
    response = await me();
  }
  if (response.status === 401) return null;
  if (!response.ok) throw Error("SESSION_ME_UNKNOWN");
  return meSchema.parse(await response.json()).data;
}

export async function trainerLogin(request: typeof fetch, username: string, password: string) {
  const response = await request("/api/v1/auth/login", {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Gafus-Auth-Transport": "cookie" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw Error("LOGIN_FAILED");
  return loginSchema.parse(await response.json()).data.user;
}

export async function trainerLogout(request: typeof fetch) {
  const response = await request("/api/v1/auth/logout", {
    method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Gafus-Auth-Transport": "cookie" },
    body: "{}",
  });
  if (!response.ok) throw Error("LOGOUT_FAILED");
}

export function buildSession(actor: BrowserActor): BrowserSession {
  const epoch = globalThis.crypto?.randomUUID?.();
  if (!epoch) throw Error("NO_SECURE_BROWSER_ENTROPY");
  return { actor: { id: actor.id, role: actor.role }, username: actor.username,
    epoch, witness: `cookie-session:${epoch}` };
}
