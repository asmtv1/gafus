// @vitest-environment node
/** V101 registered Hono Vet LIST/DETAIL GET -> V100 Mobile read-only helper.
 * Core handler, identity and Redis mocked. No real network, SQL or writes.
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
  vet: vi.fn(),
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
    nosniff: string | null;
    authHeaderPresent: boolean;
    envelopeSuccess: unknown;
    dataCount: number | null;
    dataId: string | null;
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
  handlePetVetVisitRequest: (...args: unknown[]) => m.vet(...args),
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
import { petVetVisitsApi } from "@/shared/lib/api/pet-vet-visits";
import {
  verifiedVetActor,
  vetVisitsForActor,
  vetVisitDetailForActor,
  vetHistoryCacheForActor,
  vetDetailCacheForActor,
} from "@/features/pets/vetVisitsRead";

const owners = {
  A: { id: "owner_A", username: "owner_a", role: "USER" as const },
  B: { id: "owner_B", username: "owner_b", role: "USER" as const },
};
const tokens: { A: string; B: string } = { A: "", B: "" };
const visit = (petId = "pet-X", ownerId = "owner_A", id = "visit-X") => ({
  id,
  petId,
  ownerId,
  visitedOn: "2026-10-18",
  specialty: "TEST_THERAPY",
  doctorName: "TEST_DOCTOR",
  clinic: "TEST_CLINIC",
  diagnosis: "TEST_DIAGNOSIS",
  conclusion: "TEST_CONCLUSION",
  notes: "TEST_NOTES",
  attachments: [],
  privateBlob: "SYNTHETIC_PRIVATE_STORAGE_MARKER",
});
const jsonOk = (data: unknown) =>
  Response.json(
    { success: true, data },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
const jsonFail = (status: number, code?: string) =>
  Response.json(
    {
      success: false,
      ...(code ? { code } : { error: "Не удалось выполнить действие. Повторите попытку позже" }),
    },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
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
  expect(entry.nosniff).toBe("nosniff");
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
    path: target.pathname,
    method: init?.method ?? "GET",
    status: response.status,
    privateCache: response.headers.get("cache-control"),
    referrer: response.headers.get("referrer-policy"),
    nosniff: response.headers.get("x-content-type-options"),
    authHeaderPresent: headers.has("authorization"),
    envelopeSuccess: envelope.success,
    dataCount: Array.isArray(envelope.data) ? envelope.data.length : null,
    dataId:
      envelope.data &&
      typeof envelope.data === "object" &&
      !Array.isArray(envelope.data) &&
      typeof (envelope.data as Record<string, unknown>).id === "string"
        ? (envelope.data as { id: string }).id
        : null,
    codePresent: typeof envelope.code === "string",
    containsDbSecret: JSON.stringify(body).includes("PRIVATE_DATABASE_TOKEN"),
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
    expect(observed.path).toMatch(/^\/api\/v1\/pets\/[^/]+\/vet-visits(?:\/[^/]+)?$/);
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
  m.vet.mockImplementation(async (_req: Request, petId: string, ownerId: string, parts: string[]) =>
    jsonOk(parts.length ? visit(petId, ownerId, parts[0]) : [visit(petId, ownerId)]),
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
const readList = (petId = "pet-X") => vetVisitsForActor(verifiedVetActor(), petId).queryFn();
const readDetail = (petId = "pet-X", visitId = "visit-X") =>
  vetVisitDetailForActor(verifiedVetActor(), petId, visitId).queryFn();
describe("AG3 V101 registered Hono ↔ actual Mobile veterinary list/detail read-only", () => {
  it("signed A own list Hono200, correct route and signed Core actor, strict scoped/medical metadata", async () => {
    const actor = verifiedVetActor();
    expect(actor).toEqual({ ownerId: owners.A.id, authEpoch: "E1" });
    const result = await readList();
    expect(result).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.A.id, authEpoch: "E1", petId: "pet-X" },
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.data).toEqual([
      {
        id: "visit-X",
        petId: "pet-X",
        visitedOn: "2026-10-18",
        specialty: "TEST_THERAPY",
        doctorName: "TEST_DOCTOR",
        clinic: "TEST_CLINIC",
        diagnosis: "TEST_DIAGNOSIS",
        conclusion: "TEST_CONCLUSION",
        notes: "TEST_NOTES",
        attachments: [],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_STORAGE_MARKER");
    expect(vetHistoryCacheForActor(result, actor, "pet-X")?.kind).toBe("ready");
    expect(m.vet).toHaveBeenCalledExactlyOnceWith(expect.any(Request), "pet-X", owners.A.id, []);
    expect(m.wire[0]).toMatchObject({
      status: 200,
      path: "/api/v1/pets/pet-X/vet-visits",
      envelopeSuccess: true,
      dataCount: 1,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed A own detail Hono200 distinct exact visit route; no media/provider interaction", async () => {
    const actor = verifiedVetActor();
    const result = await readDetail();
    expect(result).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.A.id, authEpoch: "E1", petId: "pet-X", visitId: "visit-X" },
    });
    expect(vetDetailCacheForActor(result, actor, "pet-X", "visit-X")?.kind).toBe("ready");
    expect(m.vet).toHaveBeenCalledExactlyOnceWith(expect.any(Request), "pet-X", owners.A.id, [
      "visit-X",
    ]);
    expect(m.wire[0]).toMatchObject({
      status: 200,
      path: "/api/v1/pets/pet-X/vet-visits/visit-X",
      dataId: "visit-X",
    });
    privateHeaderChecks(m.wire[0]!);
  });
  it("valid owned no visits is real Hono200 empty and scoped ready, not error", async () => {
    m.vet.mockResolvedValueOnce(jsonOk([]));
    const result = await readList();
    expect(result).toEqual({
      kind: "ready",
      data: [],
      scope: { ownerId: owners.A.id, authEpoch: "E1", petId: "pet-X" },
    });
    expect(m.wire[0]).toMatchObject({ status: 200, envelopeSuccess: true, dataCount: 0 });
    privateHeaderChecks(m.wire[0]!);
  });
  it("signed B from own pet/visit routes uses B authenticated owner and no A reuse", async () => {
    const a = await readList();
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    const b = await readList("pet-Y");
    const d = await readDetail("pet-Y", "visit-Y");
    expect(b).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.B.id, authEpoch: "B1", petId: "pet-Y" },
    });
    expect(d).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.B.id, authEpoch: "B1", petId: "pet-Y", visitId: "visit-Y" },
    });
    expect(vetHistoryCacheForActor(a, verifiedVetActor(), "pet-X")).toEqual({ kind: "unknown" });
    expect(m.vet.mock.calls.map(([, petId, owner, parts]) => [petId, owner, parts])).toEqual([
      ["pet-X", owners.A.id, []],
      ["pet-Y", owners.B.id, []],
      ["pet-Y", owners.B.id, ["visit-Y"]],
    ]);
    expect(m.wire.map((x) => x.status)).toEqual([200, 200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("synthetic Core foreign/list and foreign/detail 404 preserve code and never show empty", async () => {
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.vet
      .mockResolvedValueOnce(jsonFail(404, "VET_VISIT_NOT_FOUND"))
      .mockResolvedValueOnce(jsonFail(404, "VET_VISIT_NOT_FOUND"));
    expect(await readList("private-X")).toEqual({ kind: "missing" });
    expect(await readDetail("private-X", "visit-X")).toEqual({ kind: "missing" });
    expect(m.vet.mock.calls.map(([, pet, owner, parts]) => [pet, owner, parts])).toEqual([
      ["private-X", owners.B.id, []],
      ["private-X", owners.B.id, ["visit-X"]],
    ]);
    expect(m.wire.map((x) => x.status)).toEqual([404, 404]);
    expect(m.wire.every((x) => x.codePresent)).toBe(true);
    m.wire.forEach(privateHeaderChecks);
  });
});
describe("V101 authenticated Hono READ failures and strict native ownership", () => {
  it("native guest has no verified actor: zero GET and no Core/provider call", async () => {
    m.authenticated = false;
    m.currentTokenOwner = "NONE";
    expect(verifiedVetActor()).toBeNull();
    expect(vetVisitsForActor(null, "pet-X").enabled).toBe(false);
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.vet).not.toHaveBeenCalled();
  });
  it("signed-in auth user differs native verified principal: zero GET", async () => {
    m.bindingOwnerOverride = owners.B.id;
    expect(verifiedVetActor()).toBeNull();
    expect(vetVisitDetailForActor(null, "pet-X", "visit-X").enabled).toBe(false);
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.vet).not.toHaveBeenCalled();
  });
  it("invalid mobile JWT reaches actual Hono401 for list, no fake 404/empty or replay", async () => {
    m.currentTokenOwner = "INVALID";
    expect(await readList()).toEqual({ kind: "unknown" });
    expect(m.wire[0]).toMatchObject({
      status: 401,
      envelopeSuccess: false,
      authHeaderPresent: true,
    });
    privateHeaderChecks(m.wire[0]!);
    expect(m.vet).not.toHaveBeenCalled();
    expect(m.fetches).toHaveBeenCalledTimes(1);
  });
  it("synthetic Redis denial yields actual Hono429 without Core GET for detail", async () => {
    m.denied = true;
    const result = await readDetail();
    expect(result).toEqual({ kind: "unknown" });
    expect(m.wire[0]).toMatchObject({ status: 429, codePresent: false });
    privateHeaderChecks(m.wire[0]!);
    expect(m.vet).not.toHaveBeenCalled();
    expect(m.fetches).toHaveBeenCalledTimes(1);
  });
  it("synthetic Core400 / 500 envelopes on original Hono response stay unknown, not empty/medical", async () => {
    m.vet
      .mockResolvedValueOnce(jsonFail(400, "VET_VISIT_VALIDATION_ERROR"))
      .mockResolvedValueOnce(jsonFail(500));
    expect(await readList()).toEqual({ kind: "unknown" });
    expect(await readDetail()).toEqual({ kind: "unknown" });
    expect(m.wire.map((x) => x.status)).toEqual([400, 500]);
    expect(m.wire.every((x) => !x.containsDbSecret)).toBe(true);
    m.wire.forEach(privateHeaderChecks);
  });
  it("signed JWT owner B while native A: real Hono200 but foreign owner row rejected by V100", async () => {
    m.currentTokenOwner = "B";
    expect(await readList()).toEqual({ kind: "unknown" });
    expect(await readDetail()).toEqual({ kind: "unknown" });
    expect(m.vet.mock.calls.map(([, petId, ownerId]) => [petId, ownerId])).toEqual([
      ["pet-X", owners.B.id],
      ["pet-X", owners.B.id],
    ]);
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
  it("bad response 200 wrong petId, wrong visitId, malformed list or metadata cannot become empty", async () => {
    for (const bad of [
      [visit("pet-Y", owners.A.id)],
      [visit("pet-X", owners.B.id)],
      [{ ...visit(), visitedOn: "2026-02-30" }],
      [{ ...visit(), attachments: [{ id: "x", signedUrl: "PRIVATE_SIGNED_URL" }] }],
      { unexpected: "not-an-array" },
    ]) {
      m.vet.mockResolvedValueOnce(jsonOk(bad));
      expect(await readList()).toEqual({ kind: "unknown" });
    }
    m.vet
      .mockResolvedValueOnce(jsonOk(visit("pet-Y", owners.A.id)))
      .mockResolvedValueOnce(jsonOk(visit("pet-X", owners.A.id, "visit-Y")));
    expect(await readDetail()).toEqual({ kind: "unknown" });
    expect(await readDetail()).toEqual({ kind: "unknown" });
    expect(m.wire.map((x) => x.status)).toEqual([200, 200, 200, 200, 200, 200, 200]);
    m.wire.forEach(privateHeaderChecks);
  });
});
describe("V101 retired native epoch and abort through actual Mobile GET path", () => {
  it("held real Hono200 list response across native A/E1→B/B1→A/E2 is stale, fresh E2 accepted", async () => {
    const seen = deferred<Response>();
    m.fetches.mockImplementationOnce(async (...args: Parameters<typeof fetch>) => {
      const response = await inprocessFetch(...args);
      m.delayedResponse = response;
      seen.resolve(response);
      return new Promise<Response>((release) => {
        m.releaseOld = release;
      });
    });
    const old = readList();
    await seen.promise;
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.currentTokenOwner = "B";
    m.owner = owners.A.id;
    m.epoch = "E2";
    m.currentTokenOwner = "A";
    m.releaseOld?.(m.delayedResponse!);
    expect(await old).toEqual({ kind: "stale" });
    const fresh = await readList();
    expect(fresh).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.A.id, authEpoch: "E2", petId: "pet-X" },
    });
    expect(m.wire.map((x) => x.status)).toEqual([200, 200]);
    expect(m.fetches).toHaveBeenCalledTimes(2);
    m.wire.forEach(privateHeaderChecks);
  });
  it("native binding epoch rotates during SecureStore token read: old list GET never reaches Hono", async () => {
    const gate = deferred<string | null>();
    m.tokenRead.mockImplementationOnce(async (key: string) =>
      key === "auth_token" ? gate.promise : null,
    );
    const old = readList();
    m.owner = owners.B.id;
    m.epoch = "B1";
    m.owner = owners.A.id;
    m.epoch = "E2";
    gate.resolve(tokens.A);
    expect(await old).toEqual({ kind: "stale" });
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.vet).not.toHaveBeenCalled();
    const fresh = await readList();
    expect(fresh).toMatchObject({ kind: "ready", scope: { authEpoch: "E2" } });
  });
  it("logout while actual Hono detail awaits synthetic Core cannot accept late private diagnosis", async () => {
    const gate = deferred<Response>();
    m.vet.mockImplementationOnce(async () => gate.promise);
    const old = readDetail();
    await vi.waitFor(() => expect(m.vet).toHaveBeenCalledOnce());
    m.authenticated = false;
    gate.resolve(jsonOk(visit()));
    expect(await old).toEqual({ kind: "stale" });
    expect(m.wire[0]).toMatchObject({ status: 200, path: "/api/v1/pets/pet-X/vet-visits/visit-X" });
    expect(vetDetailCacheForActor(null, verifiedVetActor(), "pet-X", "visit-X")).toBeNull();
  });
  it("malformed or unsafe pet/visit route IDs blocked by reader before any GET", async () => {
    expect(await readList("unsafe/%name")).toEqual({ kind: "missing" });
    expect(await readDetail("pet-X", "unsafe/path")).toEqual({ kind: "missing" });
    expect(m.fetches).not.toHaveBeenCalled();
    expect(m.vet).not.toHaveBeenCalled();
  });
  it("injected AbortError is safe UNKNOWN Mobile read, no Hono or blind retry", async () => {
    m.fetches.mockRejectedValueOnce(Object.assign(Error("aborted"), { name: "AbortError" }));
    expect(await readList()).toEqual({ kind: "unknown" });
    expect(m.fetches).toHaveBeenCalledOnce();
    expect(m.wire).toHaveLength(0);
    expect(m.vet).not.toHaveBeenCalled();
  });
  it("actual Mobile AbortController timeout on stalled test fetch makes one attempt and zero Hono", async () => {
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
      const pending = petVetVisitsApi.listResponse("pet-X", () => true);
      await entered.promise;
      await vi.advanceTimersByTimeAsync(20_000);
      expect(await pending).toMatchObject({ success: false, code: "REQUEST_TIMEOUT" });
      expect(m.fetches).toHaveBeenCalledOnce();
      expect(m.vet).not.toHaveBeenCalled();
      expect(m.wire).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
describe("V101 existing optional ownerId and private metadata/no raw diagnostic", () => {
  it("200 list/detail without optional ownerId accepted only after signed Hono actor+epoch proof", async () => {
    const { ownerId: _owner, privateBlob: _private, ...record } = visit();
    m.vet.mockResolvedValueOnce(jsonOk([record])).mockResolvedValueOnce(jsonOk(record));
    const actor = verifiedVetActor();
    const list = await readList();
    const detail = await readDetail();
    expect(list).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.A.id, authEpoch: "E1", petId: "pet-X" },
    });
    expect(detail).toMatchObject({
      kind: "ready",
      scope: { ownerId: owners.A.id, authEpoch: "E1", petId: "pet-X", visitId: "visit-X" },
    });
    expect(vetHistoryCacheForActor(list, actor, "pet-X")?.kind).toBe("ready");
    expect(vetDetailCacheForActor(detail, actor, "pet-X", "visit-X")?.kind).toBe("ready");
    expect(m.vet.mock.calls.map(([, pet, owner, parts]) => [pet, owner, parts])).toEqual([
      ["pet-X", owners.A.id, []],
      ["pet-X", owners.A.id, ["visit-X"]],
    ]);
    expect(m.wire.every((x) => x.status === 200)).toBe(true);
  });
  it("source DTO strips private signed/storage keys and native tracer never receives clinical fixture text", async () => {
    const list = await readList();
    const detail = await readDetail();
    for (const projected of [list, detail]) {
      expect(JSON.stringify(projected)).not.toContain("SYNTHETIC_PRIVATE_STORAGE_MARKER");
      expect(JSON.stringify(projected)).not.toContain("privateBlob");
    }
    expect(JSON.stringify(m.reporter.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_STORAGE_MARKER");
    expect(m.wire.every((x) => !x.containsDbSecret)).toBe(true);
  });
});
