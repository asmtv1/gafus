// @vitest-environment node
/** Actual registered Hono individual GET ↔ installed Mobile getById + V96 strict validator.
 * Only fetch routing, Prisma identity, Core pets, Redis and native stores are stubs.
 * No real HTTP socket, TLS, SQL, device or writes.
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
  detail: vi.fn(),
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
    dataId: string | null;
    dataOwner: string | null;
    errorNotFound: boolean;
    codePresent: boolean;
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
  getPetById: m.detail,
}));
// The registered Hono list/detail now imports the dedicated original
// read-only Core barrel. Keep test stubs on the actual production path.
vi.mock("@gafus/core/services/petRead", async (original) => ({
  ...(await original<typeof PetReadCore>()),
  getUserPets: m.pets,
  getPetById: m.detail,
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
import { isCurrentPetsActor, verifiedPetsActor } from "@/shared/lib/api/profileTabQueries";
import { validatedPetDetailForActor } from "@/shared/lib/api/petsReadValidation";

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
    dataId:
      envelope.data &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      typeof (envelope.data as Record<string, unknown>).id === "string"
        ? (envelope.data as { id: string }).id
        : null,
    dataOwner:
      envelope.data &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      typeof (envelope.data as Record<string, unknown>).ownerId === "string"
        ? (envelope.data as { ownerId: string }).ownerId
        : null,
    errorNotFound: envelope.error === "Питомец не найден",
    codePresent: typeof envelope.code === "string",
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
  m.detail.mockImplementation(async (petId: string, userId: string) => pet(petId, userId));
  m.tokenRead.mockImplementation(async (key: string) => {
    if (key !== "auth_token") return null;
    if (m.currentTokenOwner === "NONE") return null;
    if (m.currentTokenOwner === "INVALID") return "broken.signature";
    return tokens[m.currentTokenOwner];
  });
  m.fetches.mockImplementation(inprocessFetch);
  vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => m.fetches(...args));
});

/** Test-only composition of current V96 edit-route read queryFn. Actual Mobile
 * GET adapter, parser and V96 strict owner/ID validator; real mounted routing
 * and query ownership tested separately by V96, not asserted by this suite.
 */
async function readDetail(id: string) {
  const actor = verifiedPetsActor();
  if (!actor || !isCurrentPetsActor(actor)) throw new Error("PET_SESSION_CHANGED");
  const response = await petsApi.getById(id, () => isCurrentPetsActor(actor));
  if (!isCurrentPetsActor(actor)) throw new Error("PET_SESSION_CHANGED");
  if (!response.success) {
    if (
      response.code === "NOT_FOUND" ||
      response.code === "PET_NOT_FOUND" ||
      response.error === "Питомец не найден"
    )
      throw new Error("PET_DETAIL_NOT_FOUND");
    throw new Error("PET_DETAIL_UNAVAILABLE");
  }
  return validatedPetDetailForActor(response.data, actor, id);
}

describe("V97 actual registered Hono individual GET → real Mobile getById/V96 validator", () => {
  it("signed A own DOG: 200 private, exact owner+id query and actual DTO", async () => {
    const dto = await readDetail("pet-X");
    expect(dto).toMatchObject({
      id: "pet-X",
      ownerId: owners.A.id,
      type: "DOG",
      notes: PRIVATE_NOTE,
    });
    expect(dto).toHaveProperty("awards");
    expect(m.detail).toHaveBeenCalledExactlyOnceWith("pet-X", owners.A.id);
    expect(m.wire[0]).toMatchObject({
      path: "/api/v1/pets/pet-X",
      method: "GET",
      status: 200,
      envelopeSuccess: true,
      dataId: "pet-X",
      dataOwner: owners.A.id,
      codePresent: false,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed A CAT preserves CAT type", async () => {
    m.detail.mockResolvedValueOnce(pet("cat-X", owners.A.id, { type: "CAT" }));
    expect(await readDetail("cat-X")).toMatchObject({
      id: "cat-X",
      ownerId: owners.A.id,
      type: "CAT",
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("A X then B Y signed JWT scopes both GET to distinct owner", async () => {
    expect((await readDetail("pet-X")).ownerId).toBe(owners.A.id);
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    expect(await readDetail("pet-Y")).toMatchObject({ id: "pet-Y", ownerId: owners.B.id });
    expect(m.detail.mock.calls.map(([id, owner]) => [id, owner])).toEqual([
      ["pet-X", owners.A.id],
      ["pet-Y", owners.B.id],
    ]);
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("Hono404 has no code, Russian not-found error and private headers", async () => {
    m.detail.mockResolvedValueOnce(null);
    await expect(readDetail("missing-X")).rejects.toThrow("PET_DETAIL_NOT_FOUND");
    expect(m.wire[0]).toMatchObject({
      path: "/api/v1/pets/missing-X",
      status: 404,
      envelopeSuccess: false,
      errorNotFound: true,
      codePresent: false,
      dataId: null,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed B asking for foreign pet: Core B owner and actual Hono404", async () => {
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.detail.mockResolvedValueOnce(null);
    await expect(readDetail("foreign-X")).rejects.toThrow("PET_DETAIL_NOT_FOUND");
    expect(m.detail).toHaveBeenCalledExactlyOnceWith("foreign-X", owners.B.id);
    expect(m.wire[0]).toMatchObject({ status: 404, errorNotFound: true, codePresent: false });
    privateHeaderChecks(m.wire[0]!);
  });
  it("adversarial Core foreign owner 200 via real Hono rejected by real Mobile DTO validator", async () => {
    m.detail.mockResolvedValueOnce(pet("pet-X", owners.B.id, { name: "PRIVATE_FOREIGN" }));
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_INVALID");
    expect(m.wire[0]).toMatchObject({ status: 200, dataOwner: owners.B.id });
    privateHeaderChecks(m.wire[0]!);
  });
  it("real Hono200 wrong pet ID rejects exact route ID", async () => {
    m.detail.mockResolvedValueOnce(pet("pet-Y", owners.A.id));
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_INVALID");
    expect(m.wire[0]).toMatchObject({ status: 200, dataId: "pet-Y" });
    privateHeaderChecks(m.wire[0]!);
  });
  it("Hono200 malformed type/name/createdAt/partial/object cannot become valid Mobile DTO", async () => {
    for (const wrong of [
      pet("pet-X", owners.A.id, { type: "HORSE" }),
      pet("pet-X", owners.A.id, { name: "" }),
      pet("pet-X", owners.A.id, { createdAt: 42 }),
      { id: "pet-X", ownerId: owners.A.id, name: "PARTIAL_PRIVATE" },
      { unexpected: "not-a-pet" },
    ]) {
      m.detail.mockResolvedValueOnce(wrong);
      await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_INVALID");
    }
    expect(m.wire.map((x) => x.status)).toEqual([200, 200, 200, 200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("registered Hono200 with undefined Core payload creates missing data; strict Mobile rejects", async () => {
    // Hono route's `if (!pet)` converts undefined to actual 404.
    m.detail.mockResolvedValueOnce(undefined);
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_NOT_FOUND");
    expect(m.wire[0]).toMatchObject({ status: 404, errorNotFound: true, codePresent: false });
    privateHeaderChecks(m.wire[0]!);
  });
  it("individual Hono 200 empty-array Core payload is malformed detail, never empty-list success", async () => {
    m.detail.mockResolvedValueOnce([]);
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_INVALID");
    expect(m.wire[0]).toMatchObject({ status: 200, envelopeSuccess: true, dataCount: 0 });
    privateHeaderChecks(m.wire[0]!);
    expect(m.detail).toHaveBeenCalledExactlyOnceWith("pet-X", owners.A.id);
  });
  it("Core failure: actual Hono500 private envelope, no token echo or fake not-found", async () => {
    m.detail.mockRejectedValueOnce(Error("PRIVATE_DATABASE_TOKEN"));
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_UNAVAILABLE");
    expect(m.wire[0]).toMatchObject({
      status: 500,
      envelopeSuccess: false,
      errorNotFound: false,
      codePresent: false,
      dataId: null,
      containsDbSecret: false,
    });
    privateHeaderChecks(m.wire[0]!);
    expect(JSON.stringify(m.reporter.mock.calls)).not.toContain("PRIVATE_DATABASE_TOKEN");
  });
  it("mock Redis limiter yields actual Hono429 without Core access", async () => {
    m.denied = true;
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_UNAVAILABLE");
    expect(m.wire[0]?.status).toBe(429);
    expect(m.wire[0]?.envelopeSuccess).not.toBe(true);
    privateHeaderChecks(m.wire[0]!);
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("native guest zero GET; invalid JWT actual 401 no resend when refresh token absent", async () => {
    m.authenticated = false;
    m.currentTokenOwner = "NONE";
    await expect(readDetail("pet-X")).rejects.toThrow("PET_SESSION_CHANGED");
    expect(m.fetches).not.toHaveBeenCalled();
    m.authenticated = true;
    m.currentTokenOwner = "INVALID";
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_UNAVAILABLE");
    expect(m.wire).toHaveLength(1);
    expect(m.wire[0]?.status).toBe(401);
    expect(m.wire[0]?.envelopeSuccess).not.toBe(true);
    privateHeaderChecks(m.wire[0]!);
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("signed JWT B while native owner A: Mobile V96 rejects foreign200", async () => {
    m.currentTokenOwner = "B";
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_INVALID");
    expect(m.detail).toHaveBeenCalledExactlyOnceWith("pet-X", owners.B.id);
    expect(m.wire[0]).toMatchObject({ status: 200, dataOwner: owners.B.id });
    privateHeaderChecks(m.wire[0]!);
  });
  it("A E1 delayed real Hono200 across A→B→A E2 rejected; new E2 GET succeeds", async () => {
    const received = deferred<Response>();
    m.fetches.mockImplementationOnce(async (...args: Parameters<typeof fetch>) => {
      const r = await inprocessFetch(...args);
      m.delayedResponse = r;
      received.resolve(r);
      return new Promise<Response>((resolve) => {
        m.releaseOld = resolve;
      });
    });
    const old = readDetail("pet-X");
    await received.promise;
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.owner = owners.A.id;
    m.epoch = "E2";
    m.currentTokenOwner = "A";
    m.releaseOld?.(m.delayedResponse!);
    await expect(old).rejects.toThrow("PET_SESSION_CHANGED");
    expect(await readDetail("pet-X")).toMatchObject({ id: "pet-X", ownerId: owners.A.id });
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
  });
  it("epoch rotates while SecureStore awaits token; old requestGuard prevents GET", async () => {
    const wait = deferred<string | null>();
    m.tokenRead.mockImplementationOnce(async (key: string) =>
      key === "auth_token" ? wait.promise : null,
    );
    const old = readDetail("pet-X");
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.owner = owners.A.id;
    m.epoch = "E2";
    wait.resolve(tokens.A);
    await expect(old).rejects.toThrow("PET_SESSION_CHANGED");
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.detail).not.toHaveBeenCalled();
    expect((await readDetail("pet-X")).ownerId).toBe(owners.A.id);
  });
  it("logout with pending Core GET: late Hono200 cannot be Mobile ACK", async () => {
    const wait = deferred<ReturnType<typeof pet>>();
    m.detail.mockImplementationOnce(async () => wait.promise);
    const old = readDetail("pet-X");
    await vi.waitFor(() => expect(m.detail).toHaveBeenCalledOnce());
    m.authenticated = false;
    wait.resolve(pet("pet-X", owners.A.id));
    await expect(old).rejects.toThrow("PET_SESSION_CHANGED");
    expect(m.wire[0]?.status).toBe(200);
    expect(m.fetches).toHaveBeenCalledTimes(1);
  });
  it("injected abort-like failure: real Mobile non-success, no Hono or retry", async () => {
    m.fetches.mockRejectedValueOnce(Object.assign(Error("aborted"), { name: "AbortError" }));
    await expect(readDetail("pet-X")).rejects.toThrow("PET_DETAIL_UNAVAILABLE");
    expect(m.wire).toHaveLength(0);
    expect(m.detail).not.toHaveBeenCalled();
    expect(m.fetches).toHaveBeenCalledTimes(1);
  });
  it("Mobile real AbortController timeout aborts stalled test fetch, one attempt, zero Hono", async () => {
    const entered = deferred<void>();
    m.fetches.mockImplementationOnce(
      async (_url: RequestInfo | URL, opts: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = opts.signal;
          expect(signal).toBeInstanceOf(AbortSignal);
          signal?.addEventListener(
            "abort",
            () => reject(Object.assign(Error("timed out"), { name: "AbortError" })),
            { once: true },
          );
          entered.resolve();
        }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = petsApi.getById("pet-X", () => true);
      await entered.promise;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await pending).toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
      expect(m.fetches).toHaveBeenCalledTimes(1);
      expect(m.wire).toHaveLength(0);
      expect(m.detail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
