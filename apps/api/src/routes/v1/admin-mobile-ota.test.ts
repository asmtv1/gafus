import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  verify: vi.fn(), completed: vi.fn(), readRole: vi.fn(),
  list: vi.fn(), update: vi.fn(), create: vi.fn(), registerPatch: vi.fn(), applyPatch: vi.fn(), listPatchApplications: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: mocked.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: mocked.completed }));
vi.mock("../../modules/admin-users/composition/service.js", () => ({ readAdminActorRole: mocked.readRole }));
vi.mock("../../modules/mobile-ota/deployment-commands.js", () => ({
  listMobileOtaDeployments: mocked.list,
  updateMobileOtaDeployment: mocked.update,
  createMobileOtaDeployment: mocked.create,
  MobileOtaDeploymentError: class MobileOtaDeploymentError extends Error {
    constructor(public code: string) { super(code); }
  },
}));
vi.mock("../../modules/mobile-ota/patch-commands.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../modules/mobile-ota/patch-commands")>(),
  registerSourcePatchDefinition: mocked.registerPatch,
  registerSourcePatchApplication: mocked.applyPatch,
  listSourcePatchApplications: mocked.listPatchApplications,
}));
vi.mock("@gafus/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));
import { authMiddleware } from "../../middleware/auth";
import { adminMobileOtaRoutes } from "./admin-mobile-ota";
const path = "/api/v1/admin/mobile-ota";
function app() {
  const a = new Hono();
  a.use(`${path}/*`, authMiddleware);
  a.route(path, adminMobileOtaRoutes);
  return a;
}
const deploymentId = "8a115d1a-a21a-4317-ab79-ed656a01e055";
const releaseId = "97b6dd04-f4a5-4bd4-a556-6aa83e25d34e";
function request(uri: string, method: "GET" | "POST" = "GET", body?: object, authenticated = true) {
  return app().request("https://gafus.test"+path+uri, {
    method, headers: {
      ...(authenticated ? { authorization: "Bearer example" } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const payload = { operationId: "preview-ota-operation-01", expectedVersion: 3,
  reason: "Verified QA and signed files", releaseId };
beforeEach(() => {
  vi.clearAllMocks();
  mocked.verify.mockResolvedValue({ id: "admin-1", role: "ADMIN", username: "admin" });
  mocked.completed.mockResolvedValue(true);
  mocked.readRole.mockResolvedValue("ADMIN");
  mocked.list.mockResolvedValue([{ id: deploymentId, rowVersion: 3, paused: true }]);
  mocked.update.mockResolvedValue({ id: deploymentId, version: 4, paused: false, replayed: false });
  mocked.create.mockResolvedValue({ id: deploymentId, version: 1, paused: true, replayed: false });
  mocked.registerPatch.mockResolvedValue({id:"9e31a365-1aa2-4a99-a99d-698ede5c5075",state:"PRIVATE_SOURCE_ONLY",replayed:false});
  mocked.applyPatch.mockResolvedValue({id:"a10f5492-31e2-4382-8af2-d09d265f5b0e",state:"DRAFT",replayed:false});
});
describe("OTA admin mounted HTTP boundaries", () => {
  it("blocks unauthenticated reads before any registry call", async () => {
    const r = await request("/deployments", "GET", undefined, false);
    expect(r.status).toBe(401);
    expect(mocked.list).not.toHaveBeenCalled();
  });
  it("blocks moderator even when token has higher obsolete role", async () => {
    mocked.readRole.mockResolvedValue("MODERATOR");
    const r = await request("/deployments");
    expect(r.status).toBe(403);
    expect(mocked.list).not.toHaveBeenCalled();
  });
  it("uses live role and returns only summary of deployments", async () => {
    const r = await request("/deployments");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    await expect(r.json()).resolves.toMatchObject({ success: true,
      data: [{ id: deploymentId, rowVersion: 3 }] });
  });
  it("creates a new deployment only as paused with typed verified native ID", async () => {
    const nativeReleaseId = "9e31a365-1aa2-4a99-a99d-698ede5c5075";
    const body = {nativeReleaseId,operationId:"create-preview-ota-20261112",reason:"Verified native binary on device"};
    const result = await request("/deployments","POST",body);
    expect(result.status).toBe(200);
    expect(mocked.create).toHaveBeenCalledWith({...body,actorId:"admin-1"});
    await expect(result.json()).resolves.toMatchObject({success:true,data:{paused:true,version:1}});
  });
  it("rejects malformed and unsupported create requests before SQL", async () => {
    for (const data of [
      {nativeReleaseId:"../wrong",operationId:"create-preview-ota-20261112",reason:"Verified native binary"},
      {nativeReleaseId:"9e31a365-1aa2-4a99-a99d-698ede5c5075",operationId:"x",reason:"Verified native binary"},
      {nativeReleaseId:"9e31a365-1aa2-4a99-a99d-698ede5c5075",operationId:"create-preview-ota-20261112",reason:"a"},
      {nativeReleaseId:"9e31a365-1aa2-4a99-a99d-698ede5c5075",operationId:"create-preview-ota-20261112",reason:"Verified native binary",publish:true},
    ]) {
      const response=await request("/deployments","POST",data);
      expect(response.status).toBe(400);
    }
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("denies moderator deployment creation before DB", async () => {
    mocked.readRole.mockResolvedValue("MODERATOR");
    const response=await request("/deployments","POST",{
      nativeReleaseId:"9e31a365-1aa2-4a99-a99d-698ede5c5075",
      operationId:"create-preview-ota-20261112", reason:"Verified native binary",
    });
    expect(response.status).toBe(403);
    expect(mocked.create).not.toHaveBeenCalled();
  });
  it("accepts an allowlisted source recovery definition but never an OTA payment patch", async () => {
    const definition = {
      operationId:"register-private-patch-20261112",version:"1.0.0",sha256:"a".repeat(64),
      allowedBases:["b".repeat(40)],
      allowedPaths:["apps/mobile/src/features/app-subscription/lib/appleAppSubscriptionPurchase.ts"],
      nativeRequirements:{publication:"NEW_NATIVE_BUILD_AND_APP_REVIEW",
        targetPlatform:"ios",minimumVersion:"1.7.5",otaCompatible:false},
      sourceLocation:"private://mobile-patches/approved-test.patch",
    };
    const accepted=await request("/patches","POST",definition);
    expect(accepted.status).toBe(200);
    expect(mocked.registerPatch).toHaveBeenCalledWith(definition,"admin-1");
    const unsafe=await request("/patches","POST",{
      ...definition,nativeRequirements:{...definition.nativeRequirements,otaCompatible:true},
    });
    expect(unsafe.status).toBe(400);
    const scripts=await request("/patches","POST",{
      ...definition,allowedPaths:["apps/mobile/scripts/publish-update-with-apptracer.mjs"],
    });
    expect(scripts.status).toBe(400);
    expect(mocked.registerPatch).toHaveBeenCalledTimes(1);
  });
  it("creates a draft-only source patch application with strict native target", async () => {
    const input={operationId:"apply-recovery-qa-20261112",
      patchDefinitionId:"9e31a365-1aa2-4a99-a99d-698ede5c5075",
      nativeReleaseId:"b17c9ec5-a9a9-448b-81a7-670d55df2e6d",baseSha:"c".repeat(40)};
    const result=await request("/patch-applications","POST",input);
    expect(result.status).toBe(200);
    expect(mocked.applyPatch).toHaveBeenCalledWith(input,"admin-1");
    const malformed=await request("/patch-applications","POST",{...input,baseSha:"./malicious"});
    expect(malformed.status).toBe(400);
  });
  it("accepts explicit staged publish and audited rollout increment",async()=>{
    const initial={...payload,rolloutPercent:1};
    const publish=await request(`/deployments/${deploymentId}/publish`,"POST",initial);
    expect(publish.status).toBe(200);
    expect(mocked.update).toHaveBeenCalledWith({
      deploymentId,actorId:"admin-1",action:"PUBLISH",...initial,
    });
    mocked.update.mockClear();
    const expand={operationId:"expand-preview-ota-20261112",expectedVersion:4,
      reason:"QA shows no client startup crashes",rolloutPercent:10};
    const response=await request(`/deployments/${deploymentId}/rollout`,"POST",expand);
    expect(response.status).toBe(200);
    expect(mocked.update).toHaveBeenCalledWith({
      deploymentId,actorId:"admin-1",action:"ROLLOUT",releaseId:undefined,...expand,
    });
  });
  it("rejects unsupported rollout values or combined operations",async()=>{
    const base={operationId:"expand-preview-ota-20261112",expectedVersion:4,
      reason:"Confirmed preview installation checks"};
    for(const value of [
      {...base,rolloutPercent:3},
      {...base,rolloutPercent:0},
      {...base,rolloutPercent:101},
      {...base},
      {...base,releaseId,rolloutPercent:10},
    ]) expect((await request(`/deployments/${deploymentId}/rollout`,"POST",value)).status).toBe(400);
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("requires typed immutable idempotent publish command", async () => {
    const r = await request(`/deployments/${deploymentId}/publish`, "POST", payload);
    expect(r.status).toBe(200);
    expect(mocked.update).toHaveBeenCalledWith({
      deploymentId, actorId: "admin-1", action: "PUBLISH", ...payload,
    });
  });
  it.each([
    ["invalid release UUID", { ...payload, releaseId: "../../foo" }],
    ["missing expected version", { ...payload, expectedVersion: undefined }],
    ["short reason", { ...payload, reason: "a" }],
    ["additional key", { ...payload, command: "rm -rf /" }],
  ])("rejects %s before write", async (_name, p) => {
    const r = await request(`/deployments/${deploymentId}/publish`, "POST", p);
    expect(r.status).toBe(400);
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("prevents pause with supplied releaseId", async () => {
    const r = await request(`/deployments/${deploymentId}/pause`, "POST", payload);
    expect(r.status).toBe(400);
    expect(mocked.update).not.toHaveBeenCalled();
  });
  it("does not accept revoked role even with valid authenticated session", async () => {
    mocked.readRole.mockResolvedValue("USER");
    const r = await request(`/deployments/${deploymentId}/publish`, "POST", payload);
    expect(r.status).toBe(403);
    expect(mocked.update).not.toHaveBeenCalled();
  });
});
