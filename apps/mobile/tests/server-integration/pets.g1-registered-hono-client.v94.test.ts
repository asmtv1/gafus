// @vitest-environment node
/** Actual registered Hono GET ↔ installed Mobile GET adapter and owner/epoch validator.
 * Only fetch routing, Prisma identity, Core pets, Redis limiter and native stores
 * are test-only stubs. No real HTTP socket, auth refresh, SQL, device or writes.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as PetsCore from "@gafus/core/services/pets";
import type * as PetReadCore from "@gafus/core/services/petRead";

const m = vi.hoisted(() => ({
  owner: "owner_A",
  epoch: "E1",
  authenticated: true,
  pets: vi.fn(),
  session: vi.fn(),
  registration: vi.fn(),
  tokenRead: vi.fn(),
  denied: false,
  keys: [] as string[],
  wire: [] as {
    path: string;
    method: string;
    status: number;
    privateCache: string | null;
    referrer: string | null;
    authHeaderPresent: boolean;
    envelopeSuccess: unknown;
    hasErrorText: boolean;
    dataCount: number | null;
    containsDbSecret: boolean;
  }[],
  fetches: vi.fn(),
  reporter: vi.fn(),
  releaseOld: undefined as undefined | ((response: Response) => void),
  delayedResponse: undefined as undefined | Response,
  currentTokenOwner: "A" as "A" | "B" | "INVALID" | "NONE",
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(options: { windowMs: number }) {
      this.windowMs = options.windowMs;
    }
    async increment(key: string) {
      m.keys.push(key);
      return { totalHits: m.denied ? 101 : 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() {
      return undefined;
    }
    async resetKey() {
      return undefined;
    }
  },
}));
vi.mock("@gafus/prisma", async (original) => {
  const mod = await original<typeof PrismaModule>();
  return { ...mod, prisma: { ...mod.prisma, user: { ...mod.prisma.user, findUnique: m.session } } };
});
vi.mock("@gafus/core/services/auth", async (original) => ({
  ...(await original<object>()),
  isRegistrationCompleted: m.registration,
}));
vi.mock("@gafus/core/services/pets", async (original) => ({
  ...(await original<typeof PetsCore>()),
  getUserPets: m.pets,
}));
// The registered Hono list/detail now imports the dedicated original
// read-only Core barrel. Keep test stubs on the actual production path.
vi.mock("@gafus/core/services/petRead", async (original) => ({
  ...(await original<typeof PetReadCore>()),
  getUserPets: m.pets,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => m.tokenRead(key),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("@/shared/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: m.authenticated,
      isLoading: false,
      user: m.authenticated ? { id: m.owner } : null,
    }),
  },
}));
vi.mock("@/shared/lib/offline/newOnlyV2Native", () => ({
  newOnlyV2NativeQueues: {
    getVerifiedBinding: () =>
      m.authenticated ? { principalId: m.owner, authEpoch: m.epoch } : null,
  },
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.reporter(...args),
  addTracerBreadcrumb: vi.fn(),
}));
vi.mock("@/shared/lib/api/client-context", () => ({
  getMobileClientHeaders: () => ({ "X-Client-Platform": "ios" }),
}));
vi.mock("@/shared/lib/api/subscriptionRequired", () => ({
  shouldNotifySubscriptionRequired: () => false,
  notifySubscriptionRequired: vi.fn(),
}));
vi.mock("@/shared/config", () => ({
  API_BASE_URL: "https://inprocess-pets.invalid",
  NETWORK_TIMEOUTS: { request: 20_000 },
}));
vi.mock("@/shared/lib/api/notes", () => ({ notesApi: {} }));
vi.mock("@/shared/lib/api/subscriptions", () => ({ subscriptionsApi: {} }));
vi.mock("@/shared/lib/api/user", () => ({ userApi: {} }));
vi.mock("@/shared/lib/utils/notifications", () => ({
  getCurrentDeviceTokens: vi.fn(),
  isSameVerifiedPushActor: vi.fn(),
}));

// The app below is not a mock route: it imports the Hono app actually registered
// by apps/api/src/app.ts and uses real auth/rate/header middleware.
const { app } = await vi.importActual<{
  app: { request: (path: string, init?: RequestInit) => Promise<Response> };
}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{
  generateAccessToken: (input: { id: string; username: string; role: "USER" }) => Promise<string>;
}>("@gafus/auth/jwt");
import { petsApi } from "@/shared/lib/api/pets";
import { petsQueryOptions, petListForActor, verifiedPetsActor } from "@/shared/lib/api/profileTabQueries";

const owners = {
  A: { id: "owner_A", username: "owner_a", role: "USER" as const },
  B: { id: "owner_B", username: "owner_b", role: "USER" as const },
};
const tokens: { A: string; B: string } = { A: "", B: "" };
const PRIVATE_NOTE = "OWNER_PRIVATE_MEDICAL_NOTE";
function pet(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    ownerId,
    name: `Питомец ${id}`,
    type: "DOG",
    breed: "Метис",
    breedKey: null,
    birthDate: "2021-08-09T00:00:00.000Z",
    heightCm: null,
    weightKg: 10.5,
    targetWeightKg: null,
    neckGirthCm: null,
    muzzleGirthCm: null,
    bellyGirthCm: null,
    photoUrl: null,
    showInProfile: false,
    notes: PRIVATE_NOTE,
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-20T09:00:00.000Z",
    awards: [{ id: "private-award", petId: id, date: "2026-10-01T00:00:00.000Z" }],
    ...extra,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const privateHeaderChecks = (entry: (typeof m.wire)[number]) => {
  const cache = (entry.privateCache ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  expect(cache).toContain("private");
  expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(entry.referrer).toBe("no-referrer");
};
async function inprocessFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = new URL(String(input));
  const headers = new Headers(init?.headers);
  const response = await app.request(target.pathname + target.search, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
  });
  // Observe the real JSON envelope on a cloned Hono response; preserve the
  // original response for the installed Mobile apiClient to consume normally.
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const envelope =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  m.wire.push({
    envelopeSuccess: envelope.success,
    hasErrorText: typeof envelope.error === "string",
    dataCount: Array.isArray(envelope.data) ? envelope.data.length : null,
    containsDbSecret: JSON.stringify(body).includes("PRIVATE_DATABASE_TOKEN"),
    path: target.pathname,
    method: init?.method ?? "GET",
    status: response.status,
    privateCache: response.headers.get("cache-control"),
    referrer: response.headers.get("referrer-policy"),
    authHeaderPresent: headers.has("authorization"),
  });
  return response;
}
beforeAll(async () => {
  vi.stubGlobal("__DEV__", false);
  vi.stubEnv("JWT_SECRET", randomBytes(48).toString("hex"));
  tokens.A = await generateAccessToken(owners.A);
  tokens.B = await generateAccessToken(owners.B);
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "owner_A";
  m.epoch = "E1";
  m.authenticated = true;
  m.denied = false;
  m.keys.length = 0;
  m.wire.length = 0;
  m.currentTokenOwner = "A";
  m.releaseOld = undefined;
  m.delayedResponse = undefined;
  m.registration.mockResolvedValue(true);
  m.session.mockResolvedValue({ sessionsRevokedAt: null, registrationPending: false, role: "USER" });
  m.pets.mockImplementation(async (id: string, options: { throwOnError: boolean }) => {
    expect(options).toEqual({ throwOnError: true });
    return [pet(`pet_${id}`, id)];
  });
  m.tokenRead.mockImplementation(async (key: string) => {
    if (key !== "auth_token") return null;
    if (m.currentTokenOwner === "NONE") return null;
    if (m.currentTokenOwner === "INVALID") return "broken.signature";
    return tokens[m.currentTokenOwner];
  });
  m.fetches.mockImplementation(inprocessFetch);
  vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => m.fetches(...args));
});

describe("V94 existing Mobile petsApi.getAll+strictvalidator → ACTUAL registered Hono GET", () => {
  it("USER A signed JWT: real GET private200 envelope, one owner Prisma-Core callback, real Mobile stamp", async () => {
    const projected = await petsQueryOptions.queryFn();
    expect(projected.success).toBe(true);
    expect(projected.__petsOwnerId).toBe(owners.A.id);
    expect(projected.__petsAuthEpoch).toBe("E1");
    expect(petListForActor(projected, verifiedPetsActor())).toMatchObject([
      { id: "pet_owner_A", ownerId: owners.A.id, type: "DOG", notes: PRIVATE_NOTE },
    ]);
    expect(projected.data?.[0]).toHaveProperty("awards"); // real raw Core relation, not fake projection
    expect(m.pets).toHaveBeenCalledExactlyOnceWith(owners.A.id, { throwOnError: true });
    expect(m.wire).toHaveLength(1);
    expect(m.wire[0]).toMatchObject({
      path: "/api/v1/pets",
      method: "GET",
      status: 200,
      envelopeSuccess: true,
      dataCount: 1,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("synthetic signed GET returns both own DOG and CAT with original Hono private body", async () => {
    m.pets.mockResolvedValueOnce([
      pet("dog_A", "owner_A"),
      pet("cat_A", "owner_A", { type: "CAT" }),
    ]);
    const result = await petsQueryOptions.queryFn();
    expect(petListForActor(result, verifiedPetsActor())).toMatchObject([
      { id: "dog_A", type: "DOG", ownerId: "owner_A" },
      { id: "cat_A", type: "CAT", ownerId: "owner_A" },
    ]);
    expect(result.data?.every((p) => p.notes === PRIVATE_NOTE)).toBe(true);
    expect(m.wire).toHaveLength(1);
    privateHeaderChecks(m.wire[0]!);
  });
  it("valid signed B JWT with stale native A actor rejects foreign Core rows at Mobile boundary", async () => {
    m.currentTokenOwner = "B";
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_INVALID");
    expect(m.pets).toHaveBeenCalledExactlyOnceWith("owner_B", { throwOnError: true });
    expect(m.wire[0]?.status).toBe(200);
    privateHeaderChecks(m.wire[0]!);
  });
  it("USER B signed JWT after A: only B row; A private note/id never served to B", async () => {
    await petsQueryOptions.queryFn();
    m.owner = "owner_B";
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    const projected = await petsQueryOptions.queryFn();
    expect(petListForActor(projected, verifiedPetsActor())).toMatchObject([
      { id: "pet_owner_B", ownerId: "owner_B" },
    ]);
    expect(projected.data?.some((x) => x.ownerId === "owner_A")).toBe(false);
    expect(m.pets.mock.calls.map((x) => x[0])).toEqual(["owner_A", "owner_B"]);
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("valid empty signed Hono 200 returns only current owned empty list (not error)", async () => {
    m.pets.mockResolvedValueOnce([]);
    const result = await petsQueryOptions.queryFn();
    expect(petListForActor(result, verifiedPetsActor())).toEqual([]);
    expect(m.wire.map((x) => x.status)).toEqual([200]);
    privateHeaderChecks(m.wire[0]!);
  });
  it("actual Hono 200 foreign Core row is rejected by installed Mobile runtime projector", async () => {
    m.pets.mockResolvedValueOnce([pet("foreign", "owner_B")]);
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_INVALID");
    expect(m.wire[0]?.status).toBe(200);
    privateHeaderChecks(m.wire[0]!);
  });
  it("actual Hono 200 malformed Core CAT/DOG/required fields reject; never treat as []", async () => {
    for (const bad of [{ type: "HORSE" }, { name: "" }, { ownerId: null }, { birthDate: 44 }]) {
      m.pets.mockResolvedValueOnce([pet("pet_owner_A", "owner_A", bad)]);
      await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_INVALID");
    }
    expect(m.wire.map((x) => x.status)).toEqual([200, 200, 200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("synthetic Redis limiter → real Hono 429 envelope, no Core and no false empty", async () => {
    m.denied = true;
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_UNAVAILABLE");
    expect(m.wire[0]?.status).toBe(429);
    expect(m.wire[0]?.envelopeSuccess).not.toBe(true);
    expect(m.wire[0]?.dataCount).toBeNull();
    privateHeaderChecks(m.wire[0]!);
    expect(m.pets).not.toHaveBeenCalled();
  });
  it("synthetic Core failure → Hono 500 safe envelope, no fallback [] nor sensitive echo", async () => {
    m.pets.mockRejectedValueOnce(Error("PRIVATE_DATABASE_TOKEN"));
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_UNAVAILABLE");
    expect(m.wire[0]?.status).toBe(500);
    expect(m.wire[0]?.envelopeSuccess).not.toBe(true);
    expect(m.wire[0]?.hasErrorText).toBe(true);
    expect(m.wire[0]?.dataCount).toBeNull();
    expect(m.wire[0]?.containsDbSecret).toBe(false);
    privateHeaderChecks(m.wire[0]!);
    expect(JSON.stringify(m.reporter.mock.calls)).not.toContain("PRIVATE_DATABASE_TOKEN");
  });
  it("no native actor: guest zero GET; invalid JWT 401 from actual Hono and Mobile fail closed", async () => {
    m.authenticated = false;
    m.currentTokenOwner = "NONE";
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_SESSION_CHANGED");
    expect(m.fetches).not.toHaveBeenCalled();
    m.authenticated = true;
    m.currentTokenOwner = "INVALID";
    const response = await petsApi.getAll(() => true);
    expect(response.success).toBe(false);
    expect(m.wire[0]?.status).toBe(401);
    expect(m.fetches).toHaveBeenCalledTimes(1); // Missing refresh token must not auto resend GET.
    expect(m.wire[0]?.envelopeSuccess).not.toBe(true);
    expect(m.wire[0]?.dataCount).toBeNull();
    privateHeaderChecks(m.wire[0]!);
    expect(m.pets).not.toHaveBeenCalled();
  });
  it("A→B→A new epoch during delayed Hono response: installed Mobile guard rejects late A", async () => {
    const delayed = deferred<Response>();
    m.fetches.mockImplementationOnce(async (...args: Parameters<typeof fetch>) => {
      const r = await inprocessFetch(...args);
      m.delayedResponse = r;
      delayed.resolve(r);
      return new Promise<Response>((resolve) => {
        m.releaseOld = resolve;
      });
    });
    const pending = petsQueryOptions.queryFn();
    await delayed.promise;
    m.owner = "owner_B";
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.owner = "owner_A";
    m.epoch = "E2";
    m.currentTokenOwner = "A";
    m.releaseOld?.(m.delayedResponse!);
    await expect(pending).rejects.toThrow("PETS_SESSION_CHANGED");
    const current = await petsQueryOptions.queryFn();
    expect(current.__petsAuthEpoch).toBe("E2");
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
  });
  it("authEpoch flips while Mobile awaits SecureStore token: no GET after guard", async () => {
    const pendingToken = deferred<string | null>();
    m.tokenRead.mockImplementationOnce(async (key: string) =>
      key === "auth_token" ? pendingToken.promise : null,
    );
    const pending = petsQueryOptions.queryFn();
    m.owner = "owner_B";
    m.epoch = "B1";
    m.owner = "owner_A";
    m.epoch = "E2";
    pendingToken.resolve(tokens.A);
    await expect(pending).rejects.toThrow("PETS_SESSION_CHANGED");
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.pets).not.toHaveBeenCalled();
    const fresh = await petsQueryOptions.queryFn();
    expect(fresh.__petsAuthEpoch).toBe("E2");
    expect(m.wire.map((x) => x.status)).toEqual([200]);
  });
  it("actual Hono owner Core promise resolves after logout: no late private cache ACK", async () => {
    const old = deferred<ReturnType<typeof pet>[]>();
    m.pets.mockImplementationOnce(async () => old.promise);
    const pending = petsQueryOptions.queryFn();
    await vi.waitFor(() => expect(m.pets).toHaveBeenCalledTimes(1));
    m.authenticated = false;
    old.resolve([pet("private-stale", "owner_A")]);
    await expect(pending).rejects.toThrow("PETS_SESSION_CHANGED");
    expect(m.wire.map((w) => w.status)).toEqual([200]);
    expect(m.fetches).toHaveBeenCalledTimes(1);
    expect(petListForActor(undefined, verifiedPetsActor())).toBeNull();
  });
  it("real Hono rejects malformed Core non-array with 500; Mobile fails closed (never empty list)", async () => {
    m.pets.mockResolvedValueOnce({ unexpected: "not-array" });
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_UNAVAILABLE");
    // Current real Hono routes now call Array.map to project pet media.
    // A non-array Core response raises and is masked as a safe 500, not 200.
    expect(m.wire[0]).toMatchObject({ status: 500, envelopeSuccess: false, dataCount: null });
    privateHeaderChecks(m.wire[0]!);
  });
  it("Mobile real fetchWithTimeout AbortController aborts stalled test transport without Hono/GET retry", async () => {
    const entered = deferred<void>();
    m.fetches.mockImplementationOnce(async (_url: RequestInfo | URL, options: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = options.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        signal?.addEventListener(
          "abort",
          () =>
            reject(
              Object.assign(new Error("aborted by actual AbortController"), { name: "AbortError" }),
            ),
          { once: true },
        );
        entered.resolve();
      });
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = petsApi.getAll(() => true);
      await entered.promise;
      await vi.advanceTimersByTimeAsync(20_000);
      const response = await pending;
      expect(response).toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
      expect(m.fetches).toHaveBeenCalledTimes(1);
      expect(m.wire).toHaveLength(0);
      expect(m.pets).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("abort-like injected fetch rejection uses actual Mobile timeout response; never empty", async () => {
    m.fetches.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(petsQueryOptions.queryFn()).rejects.toThrow("PETS_LIST_UNAVAILABLE");
    expect(m.pets).not.toHaveBeenCalled();
  });
});
