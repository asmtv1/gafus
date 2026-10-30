// @vitest-environment node
/** V99 registered Hono GET weight → actual Mobile apiClient + V98 readWeightHistory.
 * JWT/Hono middleware, original Response and Mobile parser are real. Only
 * Core/Prisma/Redis/native/fetch relay are test-only. No writes or real network.
 */
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type * as PetsCore from "@gafus/core/services/pets";

const m = vi.hoisted(() => ({
  owner: "owner_A",
  epoch: "E1",
  bindingOwnerOverride: null as string | null,
  authenticated: true,
  pets: vi.fn(),
  weight: vi.fn(),
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
    measuredCount: number | null;
    latestKg: number | null;
    nullableCurrent: boolean;
    nullableTarget: boolean;
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
  getPetWeightHistory: m.weight,
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
      m.authenticated
        ? { principalId: m.bindingOwnerOverride ?? m.owner, authEpoch: m.epoch }
        : null,
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
import { petWeightApi } from "@/shared/lib/api/pets";
import { readWeightHistory, projectedWeightHistory, verifiedWeightActor } from "@/features/pets/petWeightRead";

const owners = {
  A: { id: "owner_A", username: "owner_a", role: "USER" as const },
  B: { id: "owner_B", username: "owner_b", role: "USER" as const },
};
const tokens: { A: string; B: string } = { A: "", B: "" };
const SECRET_DIAG = "PRIVATE_DATABASE_TOKEN";
const instant = (date: string) => new Date(date);
const row = (
  id: string,
  petId: string,
  ownerId: string,
  weightKg: number,
  measuredAt: string,
  createdAt = measuredAt,
) => ({
  id,
  petId,
  ownerId,
  weightKg,
  measuredAt: instant(measuredAt),
  createdAt: instant(createdAt),
});
const history = (
  petId: string,
  ownerId: string,
  entries: unknown[] = [],
  currentWeightKg: number | null = null,
  targetWeightKg: number | null = null,
) => ({
  currentWeightKg,
  targetWeightKg,
  entries,
});
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
    measuredCount:
      envelope.data &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      Array.isArray((envelope.data as Record<string, unknown>).entries)
        ? (envelope.data as { entries: unknown[] }).entries.length
        : null,
    latestKg:
      envelope.data &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      typeof (envelope.data as Record<string, unknown>).currentWeightKg === "number"
        ? (envelope.data as { currentWeightKg: number }).currentWeightKg
        : null,
    nullableCurrent:
      envelope.data !== null &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      (envelope.data as Record<string, unknown>).currentWeightKg === null,
    nullableTarget:
      envelope.data !== null &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      (envelope.data as Record<string, unknown>).targetWeightKg === null,
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
afterEach(() => {
  for (const observed of m.wire) {
    expect(observed.method).toBe("GET");
    expect(observed.path).toMatch(/^\/api\/v1\/pets\/[^/]+\/weight$/);
  }
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  m.owner = "owner_A";
  m.epoch = "E1";
  m.bindingOwnerOverride = null;
  m.authenticated = true;
  m.denied = false;
  m.keys.length = 0;
  m.wire.length = 0;
  m.currentTokenOwner = "A";
  m.releaseOld = undefined;
  m.delayedResponse = undefined;
  m.registration.mockResolvedValue(true);
  m.session.mockResolvedValue({ sessionsRevokedAt: null, registrationPending: false, role: "USER" });
  // Clear queued mockResolvedValueOnce from a previous case that was now
  // correctly blocked before HTTP: mockImplementation alone does not flush it.
  m.weight.mockReset();
  m.weight.mockImplementation(async (petId: string, userId: string) =>
    history(
      petId,
      userId,
      [row("measure-1", petId, userId, 12.4, "2026-09-01T10:00:00.000Z")],
      12.4,
      null,
    ),
  );
  m.tokenRead.mockImplementation(async (key: string) => {
    if (key !== "auth_token") return null;
    if (m.currentTokenOwner === "NONE") return null;
    if (m.currentTokenOwner === "INVALID") return "broken.signature";
    return tokens[m.currentTokenOwner];
  });
  m.fetches.mockImplementation(inprocessFetch);
  vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => m.fetches(...args));
});

describe("V99 registered Hono private weight GET → actual Mobile GET/read/strict validator", () => {
  it("signed own pet: actual Hono 200 private, Core receives signed owner+pet and Mobile preserves kg", async () => {
    const actor = verifiedWeightActor();
    expect(actor).toEqual({ ownerId: owners.A.id, authEpoch: "E1" });
    const result = await readWeightHistory("pet-X", actor!);
    expect(result).toMatchObject({
      currentWeightKg: 12.4,
      targetWeightKg: null,
      __weightOwnerId: owners.A.id,
      __weightEpoch: "E1",
      __weightPetId: "pet-X",
    });
    expect(result.entries).toEqual([
      {
        id: "measure-1",
        weightKg: 12.4,
        measuredAt: "2026-09-01T10:00:00.000Z",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ]);
    expect(m.weight).toHaveBeenCalledExactlyOnceWith("pet-X", owners.A.id);
    expect(m.wire[0]).toMatchObject({
      path: "/api/v1/pets/pet-X/weight",
      method: "GET",
      status: 200,
      envelopeSuccess: true,
      measuredCount: 1,
      latestKg: 12.4,
      nullableTarget: true,
      codePresent: false,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
    expect(projectedWeightHistory(result, "pet-X", actor)?.entries).toHaveLength(1);
    expect(m.pets).not.toHaveBeenCalled();
    expect(m.wire.every((x) => x.method === "GET")).toBe(true);
  });
  it("real Hono may echo private Core extra fields but Mobile V98 strips all unknown DTO keys", async () => {
    const raw = {
      ...row("entry", "pet-X", owners.A.id, 14.3, "2026-09-01T10:00:00.000Z"),
      privateProviderBlob: "TEST_ONLY_INTERNAL_NOTES",
      previewUrl: "https://example.invalid/private",
    };
    m.weight.mockResolvedValueOnce(history("pet-X", owners.A.id, [raw], 14.3, null));
    const result = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(result.entries[0]).toEqual({
      id: "entry",
      weightKg: 14.3,
      measuredAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-09-01T10:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("TEST_ONLY_INTERNAL_NOTES");
    expect(JSON.stringify(result)).not.toContain("previewUrl");
    expect(m.wire[0]).toMatchObject({ status: 200, envelopeSuccess: true, measuredCount: 1 });
    privateHeaderChecks(m.wire[0]!);
  });
  it("own empty Hono200 nullable current and target is valid empty read, not loading/error", async () => {
    m.weight.mockResolvedValueOnce(history("pet-X", owners.A.id));
    const result = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(result).toMatchObject({ currentWeightKg: null, targetWeightKg: null, entries: [] });
    expect(m.wire[0]).toMatchObject({
      status: 200,
      nullableCurrent: true,
      nullableTarget: true,
      measuredCount: 0,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("owned nullable current with finite target remains kg without phantom entry", async () => {
    m.weight.mockResolvedValueOnce(history("pet-X", owners.A.id, [], null, 15.75));
    const result = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(result).toMatchObject({ currentWeightKg: null, targetWeightKg: 15.75, entries: [] });
    expect(m.wire[0]).toMatchObject({
      status: 200,
      nullableCurrent: true,
      nullableTarget: false,
      measuredCount: 0,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("actual Hono serializes Core Date entries; actual Mobile sorts measuredAt ASC + createdAt ASC and keeps kg", async () => {
    const d = "2026-08-02T11:00:00.000Z";
    m.weight.mockResolvedValueOnce(
      history(
        "pet-X",
        owners.A.id,
        [
          row("latest", "pet-X", owners.A.id, 18.5, "2026-10-01T09:00:00.000Z"),
          row("later-tie", "pet-X", owners.A.id, 14.25, d, "2026-08-03T09:00:00.000Z"),
          row("first", "pet-X", owners.A.id, 10.5, "2026-06-01T09:00:00.000Z"),
          row("first-tie", "pet-X", owners.A.id, 14.1, d, d),
        ],
        18.5,
        19.25,
      ),
    );
    const result = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(result.entries.map((x) => [x.id, x.weightKg])).toEqual([
      ["first", 10.5],
      ["first-tie", 14.1],
      ["later-tie", 14.25],
      ["latest", 18.5],
    ]);
    expect(result.currentWeightKg).toBe(18.5);
    expect(result.targetWeightKg).toBe(19.25);
    expect(m.wire[0]).toMatchObject({ status: 200, measuredCount: 4, latestKg: 18.5 });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed A/X then B/Y: real Hono forwards correct pair and Mobile rejects reuse across owners", async () => {
    const first = await readWeightHistory("pet-X", verifiedWeightActor()!);
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    const second = await readWeightHistory("pet-Y", verifiedWeightActor()!);
    expect(second).toMatchObject({
      __weightOwnerId: owners.B.id,
      __weightEpoch: "B1",
      __weightPetId: "pet-Y",
    });
    expect(projectedWeightHistory(first, "pet-X", verifiedWeightActor())).toBeNull();
    expect(m.weight.mock.calls.map(([id, owner]) => [id, owner])).toEqual([
      ["pet-X", owners.A.id],
      ["pet-Y", owners.B.id],
    ]);
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("Core signed B foreign/missing pet returns actual code-less Hono404 not fake empty", async () => {
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.weight.mockResolvedValueOnce(null);
    await expect(readWeightHistory("private-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_UNAVAILABLE",
    );
    expect(m.weight).toHaveBeenCalledExactlyOnceWith("private-X", owners.B.id);
    expect(m.wire[0]).toMatchObject({
      path: "/api/v1/pets/private-X/weight",
      status: 404,
      errorNotFound: true,
      codePresent: false,
      envelopeSuccess: false,
      dataCount: null,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("Core returns foreign owner row under real Hono200; Mobile strict parser fails", async () => {
    m.weight.mockResolvedValueOnce(
      history(
        "pet-X",
        owners.A.id,
        [row("foreign", "pet-X", owners.B.id, 180, "2026-06-01T10:00:00.000Z")],
        180,
        null,
      ),
    );
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_INVALID",
    );
    expect(m.wire[0]).toMatchObject({ status: 200, envelopeSuccess: true, measuredCount: 1 });
    privateHeaderChecks(m.wire[0]!);
  });
  it("Core returns wrong petId row under Hono200: Mobile refuses private history", async () => {
    m.weight.mockResolvedValueOnce(
      history(
        "pet-X",
        owners.A.id,
        [row("wrong-pet", "pet-Y", owners.A.id, 24.2, "2026-06-01T10:00:00.000Z")],
        24.2,
        null,
      ),
    );
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_INVALID",
    );
    expect(m.wire[0]).toMatchObject({ status: 200, measuredCount: 1 });
    privateHeaderChecks(m.wire[0]!);
  });
  it("malformed Core data fails closed: HTTP200 validation errors vs server HTTP500", async () => {
    const base = row("x", "pet-X", owners.A.id, 12.1, "2026-09-01T10:00:00.000Z");
    // JSON-serializable but invalid history: route still responds 200 and
    // native validation must return PET_WEIGHT_INVALID, never empty/success.
    const malformed200: unknown[] = [
      history("pet-X", owners.A.id, [{ ...base, weightKg: "PRIVATE_WEIGHT" }]),
      history("pet-X", owners.A.id, [{ ...base, measuredAt: "not-a-date" }]),
      history("pet-X", owners.A.id, [base, base]),
      { currentWeightKg: "PRIVATE_WEIGHT", targetWeightKg: null, entries: [] },
      { targetWeightKg: null, entries: [] },
    ];
    for (const value of malformed200) {
      m.weight.mockResolvedValueOnce(value);
      await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
        "PET_WEIGHT_INVALID",
      );
    }
    // Since the API now explicitly maps Core entries to ISO timestamps,
    // non-array entries or an array-valued history cannot be mapped and the
    // Hono onError returns 500. Do not mislabel these as HTTP200 DTO errors.
    for (const value of [
      { currentWeightKg: null, targetWeightKg: null, entries: "not-array" },
      [],
    ]) {
      m.weight.mockResolvedValueOnce(value);
      await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
        "PET_WEIGHT_UNAVAILABLE",
      );
    }
    expect(m.wire.map((x) => x.status)).toEqual([200, 200, 200, 200, 200, 500, 500]);
    expect(m.wire.every(x => !x.containsDbSecret)).toBe(true);
    m.wire.forEach(privateHeaderChecks);
  });
});

describe("V99 actual Hono weight GET status and actor fencing", () => {
  it("authenticated A but native verified principal B cannot open weight GET", async () => {
    m.bindingOwnerOverride = owners.B.id;
    expect(verifiedWeightActor()).toBeNull();
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("P1 stale native A / signed B token with empty rows and currentWeight must never bind B history to A", async () => {
    m.currentTokenOwner = "B";
    m.weight.mockResolvedValueOnce(history("pet-X", owners.B.id, [], 42.25, null));
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_SESSION_CHANGED",
    );
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("P1 stale native A / signed B token with nonempty rows cannot be exposed", async () => {
    m.currentTokenOwner = "B";
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_SESSION_CHANGED",
    );
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("P1 SecureStore reads B after native A guard began, epoch unchanged: no HTTP", async () => {
    const pendingToken = deferred<string | null>();
    m.tokenRead.mockImplementationOnce(async key => key === "auth_token" ? pendingToken.promise : null);
    const pending = readWeightHistory("pet-X", verifiedWeightActor()!);
    // Verified native actor still A/E1, but exact token selected by transport is B.
    m.currentTokenOwner = "B";
    pendingToken.resolve(tokens.B);
    await expect(pending).rejects.toThrow("PET_WEIGHT_SESSION_CHANGED");
    expect(m.owner).toBe(owners.A.id);
    expect(m.epoch).toBe("E1");
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("P1 A E1 empty+current response held over A→B→A E2: old never accepted", async () => {
    const received = deferred<Response>();
    m.weight.mockResolvedValueOnce(history("pet-X", owners.A.id, [], 31.5, 38));
    m.fetches.mockImplementationOnce(async (...args: Parameters<typeof fetch>) => {
      const result = await inprocessFetch(...args);
      m.delayedResponse = result;
      received.resolve(result);
      return new Promise<Response>(done => { m.releaseOld = done; });
    });
    const old = readWeightHistory("pet-X", verifiedWeightActor()!);
    await received.promise;
    expect(m.wire[0]).toMatchObject({ status: 200, measuredCount: 0, latestKg: 31.5 });
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.owner = owners.A.id;
    m.epoch = "E2";
    m.currentTokenOwner = "A";
    m.releaseOld?.(m.delayedResponse!);
    await expect(old).rejects.toThrow("PET_WEIGHT_SESSION_CHANGED");
    const fresh = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(fresh).toMatchObject({ __weightOwnerId: owners.A.id, __weightEpoch: "E2" });
    expect(fresh.currentWeightKg).toBe(12.4);
    expect(m.wire.map(x => x.status)).toEqual([200, 200]);
    expect(m.fetches).toHaveBeenCalledTimes(2);
    m.wire.forEach(privateHeaderChecks);
  });
  it("P1 valid B token with forged native A cannot request empty target-only history", async () => {
    m.currentTokenOwner = "B";
    m.weight.mockResolvedValueOnce(history("pet-X", owners.B.id, [], null, 27.3));
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_SESSION_CHANGED",
    );
    expect(m.weight).not.toHaveBeenCalled();
    expect(m.fetches).not.toHaveBeenCalled();
  });
  it("native guest has no verified actor and sends zero GET", async () => {
    m.authenticated = false;
    m.currentTokenOwner = "NONE";
    expect(verifiedWeightActor()).toBeNull();
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("invalid JWT cannot pass native token/actor fence, zero HTTP", async () => {
    m.currentTokenOwner = "INVALID";
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_SESSION_CHANGED",
    );
    expect(m.wire).toHaveLength(0);
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("actual Hono rejects malformed JWT with HTTP401 even for ordinary transport caller", async () => {
    m.currentTokenOwner = "INVALID";
    const res = await petWeightApi.get("pet-X");
    expect(res.success).toBe(false);
    expect(m.wire).toHaveLength(1);
    expect(m.wire[0]).toMatchObject({
      status: 401,
      envelopeSuccess: false,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
    expect(m.fetches).toHaveBeenCalledOnce();
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("synthetic Redis limiter produces real Hono429, Core not called, no fake empty", async () => {
    m.denied = true;
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_UNAVAILABLE",
    );
    // Actual rate-limiter envelope omits `success`; do not fabricate `false`.
    expect(m.wire[0]).toMatchObject({
      status: 429,
      envelopeSuccess: undefined,
      codePresent: false,
    });
    privateHeaderChecks(m.wire[0]!);
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("Core error produces actual Hono500 safe private envelope, not false404", async () => {
    m.weight.mockRejectedValueOnce(new Error(SECRET_DIAG));
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_UNAVAILABLE",
    );
    expect(m.wire[0]).toMatchObject({
      status: 500,
      envelopeSuccess: false,
      errorNotFound: false,
      containsDbSecret: false,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed B JWT with stale native A identity is blocked before Hono/owner projection", async () => {
    m.currentTokenOwner = "B";
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_SESSION_CHANGED",
    );
    expect(m.weight).not.toHaveBeenCalled();
    expect(m.wire).toHaveLength(0);
    expect(m.fetches).not.toHaveBeenCalled();
  });
  it("A E1 actual Hono200 held across A→B→A E2: old rejected, fresh E2 accepted", async () => {
    const received = deferred<Response>();
    m.fetches.mockImplementationOnce(async (...args: Parameters<typeof fetch>) => {
      const response = await inprocessFetch(...args);
      m.delayedResponse = response;
      received.resolve(response);
      return new Promise<Response>((done) => {
        m.releaseOld = done;
      });
    });
    const old = readWeightHistory("pet-X", verifiedWeightActor()!);
    await received.promise;
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.owner = owners.A.id;
    m.epoch = "E2";
    m.currentTokenOwner = "A";
    m.releaseOld?.(m.delayedResponse!);
    await expect(old).rejects.toThrow("PET_WEIGHT_SESSION_CHANGED");
    const fresh = await readWeightHistory("pet-X", verifiedWeightActor()!);
    expect(fresh).toMatchObject({
      __weightOwnerId: owners.A.id,
      __weightEpoch: "E2",
      __weightPetId: "pet-X",
    });
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    m.wire.forEach(privateHeaderChecks);
    expect(m.fetches).toHaveBeenCalledTimes(2);
  });
  it("native epoch flips during SecureStore token read: guarded old GET never reaches Hono", async () => {
    const gate = deferred<string | null>();
    m.tokenRead.mockImplementationOnce(async (key) => (key === "auth_token" ? gate.promise : null));
    const stale = readWeightHistory("pet-X", verifiedWeightActor()!);
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.owner = owners.A.id;
    m.epoch = "E2";
    gate.resolve(tokens.A);
    await expect(stale).rejects.toThrow("PET_WEIGHT_SESSION_CHANGED");
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
    expect((await readWeightHistory("pet-X", verifiedWeightActor()!)).__weightEpoch).toBe("E2");
  });
  it("logout while Hono awaits Core Promise: late Hono200 not accepted as private Mobile ACK", async () => {
    const gate = deferred<ReturnType<typeof history>>();
    m.weight.mockImplementationOnce(async () => gate.promise);
    const pending = readWeightHistory("pet-X", verifiedWeightActor()!);
    await vi.waitFor(() => expect(m.weight).toHaveBeenCalledOnce());
    m.authenticated = false;
    gate.resolve(
      history(
        "pet-X",
        owners.A.id,
        [row("late", "pet-X", owners.A.id, 180, "2026-09-01T10:00:00.000Z")],
        180,
        null,
      ),
    );
    await expect(pending).rejects.toThrow("PET_WEIGHT_SESSION_CHANGED");
    expect(m.wire[0]).toMatchObject({ status: 200, envelopeSuccess: true });
    expect(m.fetches).toHaveBeenCalledOnce();
    expect(projectedWeightHistory(null, "pet-X", verifiedWeightActor())).toBeNull();
  });
  it("injected fetch AbortError is safe Mobile failure, zero Hono/GET retry", async () => {
    m.fetches.mockRejectedValueOnce(Object.assign(Error("aborted"), { name: "AbortError" }));
    await expect(readWeightHistory("pet-X", verifiedWeightActor()!)).rejects.toThrow(
      "PET_WEIGHT_UNAVAILABLE",
    );
    expect(m.fetches).toHaveBeenCalledOnce();
    expect(m.wire).toHaveLength(0);
    expect(m.weight).not.toHaveBeenCalled();
  });
  it("actual Mobile AbortController aborts stalled test fetch at 20s, no Hono/retry", async () => {
    const entered = deferred<void>();
    m.fetches.mockImplementationOnce(
      async (_url: RequestInfo | URL, options: RequestInit) =>
        new Promise<Response>((_ok, fail) => {
          expect(options.signal).toBeInstanceOf(AbortSignal);
          options.signal?.addEventListener(
            "abort",
            () => fail(Object.assign(Error("timeout"), { name: "AbortError" })),
            { once: true },
          );
          entered.resolve();
        }),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = petWeightApi.get("pet-X", () => true);
      await entered.promise;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await pending).toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
      expect(m.fetches).toHaveBeenCalledOnce();
      expect(m.weight).not.toHaveBeenCalled();
      expect(m.wire).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
