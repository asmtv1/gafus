import { Hono } from "hono";
import { listOtaTelemetrySummaries } from "@gafus/mobile-ota-server/telemetry";
import { listNativeOtaAudit, listNativeOtaReleases, listMobileOtaReleases, listMobileOtaPatchDefinitions, listMobileOtaAudit } from "../../modules/mobile-ota/queries.js";
import { patchDefinitionSchema, patchApplicationSchema, MobileOtaPatchError,
  registerSourcePatchDefinition, registerSourcePatchApplication,
  listSourcePatchApplications,
} from "../../modules/mobile-ota/patch-commands.js";
import {
  nativeReleaseInput, verifyNativeInput, MobileOtaNativeError,
  registerNativeCandidate, verifyNativeCandidate,
} from "../../modules/mobile-ota/native-release-admin.js";
import { z } from "zod/v3";
import { requireRole } from "../../middleware/auth.js";
import { readAdminActorRole } from "../../modules/admin-users/composition/service.js";
import {
  listMobileOtaDeployments, MobileOtaDeploymentError, updateMobileOtaDeployment,
  createMobileOtaDeployment,
} from "../../modules/mobile-ota/deployment-commands.js";

const UUID = z.string().uuid();
const actionInput = z.object({
  operationId: z.string().min(16).max(120).regex(/^[A-Za-z0-9_-]+$/),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(8).max(512),
  releaseId: UUID.optional(),
  rolloutPercent: z.union([z.literal(0),z.literal(1),z.literal(10),z.literal(50),z.literal(100)]).optional(),
}).strict();

export const adminMobileOtaRoutes = new Hono();
adminMobileOtaRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
adminMobileOtaRoutes.use("*", requireRole("ADMIN"));
adminMobileOtaRoutes.use("*", async (c, next) => {
  if ((await readAdminActorRole(c.get("user").id)) !== "ADMIN")
    return c.json({ success: false, code: "FORBIDDEN" }, 403);
  await next();
});
adminMobileOtaRoutes.get("/deployments", async (c) => {
  try {
    return c.json({ success: true, data: await listMobileOtaDeployments() });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});
adminMobileOtaRoutes.post("/native-releases", async (c) => {
  const parsed = nativeReleaseInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_NATIVE_RELEASE" }, 400);
  try {
    const data = await registerNativeCandidate(parsed.data, c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof MobileOtaNativeError)
      return c.json({ success: false, code: error.code }, 409);
    return c.json({ success: false, code: "NATIVE_RELEASE_REGISTRY_UNAVAILABLE" }, 503);
  }
});
adminMobileOtaRoutes.post("/native-releases/:id/verification", async (c) => {
  const id = UUID.safeParse(c.req.param("id"));
  const parsed = verifyNativeInput.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !parsed.success)
    return c.json({ success: false, code: "INVALID_NATIVE_VERIFICATION" }, 400);
  try {
    const data = await verifyNativeCandidate(id.data, parsed.data, c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof MobileOtaNativeError)
      return c.json({ success: false, code: error.code }, 409);
    return c.json({ success: false, code: "NATIVE_RELEASE_REGISTRY_UNAVAILABLE" }, 503);
  }
});
adminMobileOtaRoutes.get("/telemetry", async(c)=>{
  try{return c.json({success:true,data:await listOtaTelemetrySummaries()});}
  catch {return c.json({success:false,code:"OTA_TELEMETRY_UNAVAILABLE"},503);}
});
adminMobileOtaRoutes.get("/native-audit", async (c) => {
  try {
    const data = await listNativeOtaAudit();
    return c.json({ success: true, data });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});
adminMobileOtaRoutes.get("/native-releases", async (c) => {
  try {
    const data = await listNativeOtaReleases();
    return c.json({ success: true, data });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});
adminMobileOtaRoutes.get("/releases", async (c) => {
  try {
    const data = await listMobileOtaReleases();
    return c.json({ success: true, data });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});
adminMobileOtaRoutes.post("/patches", async (c) => {
  const parsed=patchDefinitionSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({success:false,code:"INVALID_PRIVATE_PATCH"},400);
  try {
    return c.json({success:true,data:await registerSourcePatchDefinition(parsed.data,c.get("user").id)});
  } catch(e) {
    if(e instanceof MobileOtaPatchError) return c.json({success:false,code:e.code},409);
    return c.json({success:false,code:"OTA_REGISTRY_UNAVAILABLE"},503);
  }
});
adminMobileOtaRoutes.post("/patch-applications", async (c) => {
  const parsed=patchApplicationSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({success:false,code:"INVALID_PRIVATE_PATCH_APPLICATION"},400);
  try {
    return c.json({success:true,data:await registerSourcePatchApplication(parsed.data,c.get("user").id)});
  } catch(e) {
    if(e instanceof MobileOtaPatchError) return c.json({success:false,code:e.code},409);
    return c.json({success:false,code:"OTA_REGISTRY_UNAVAILABLE"},503);
  }
});
adminMobileOtaRoutes.get("/patch-applications", async(c) => {
  try {return c.json({success:true,data:await listSourcePatchApplications()});}
  catch {return c.json({success:false,code:"OTA_REGISTRY_UNAVAILABLE"},503);}
});
adminMobileOtaRoutes.get("/patches", async (c) => {
  try {
    const data = await listMobileOtaPatchDefinitions();
    return c.json({ success: true, data });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});
adminMobileOtaRoutes.get("/audit", async (c) => {
  try {
    const data = await listMobileOtaAudit();
    return c.json({ success: true, data });
  } catch { return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503); }
});

adminMobileOtaRoutes.post("/deployments", async (c) => {
  const parsed = z.object({
    operationId: z.string().min(16).max(120).regex(/^[A-Za-z0-9_-]+$/),
    nativeReleaseId: UUID,
    reason: z.string().trim().min(8).max(512),
  }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ success: false, code: "INVALID_OTA_DEPLOYMENT" }, 400);
  try {
    const data = await createMobileOtaDeployment({ ...parsed.data, actorId: c.get("user").id });
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof MobileOtaDeploymentError)
      return c.json({ success: false, code: error.code }, 409);
    return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503);
  }
});

adminMobileOtaRoutes.post("/deployments/:id/:action", async (c) => {
  const id = UUID.safeParse(c.req.param("id"));
  const action = c.req.param("action");
  const input = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!id.success || !input.success || !["publish", "pause", "rollout"].includes(action) ||
    (action === "publish" && !input.data?.releaseId) ||
    (action === "pause" && (input.data?.releaseId || input.data?.rolloutPercent !== undefined)) ||
    (action === "rollout" && (input.data?.releaseId || !input.data?.rolloutPercent)))
    return c.json({ success: false, code: "INVALID_OTA_COMMAND" }, 400);
  try {
    const data = await updateMobileOtaDeployment({
      deploymentId: id.data,
      actorId: c.get("user").id,
      operationId: input.data.operationId,
      expectedVersion: input.data.expectedVersion,
      reason: input.data.reason,
      action: action === "publish" ? "PUBLISH" : action === "rollout" ? "ROLLOUT" : "PAUSE",
      releaseId: input.data.releaseId,
      rolloutPercent: input.data.rolloutPercent,
    });
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof MobileOtaDeploymentError) {
      return c.json({ success: false, code: error.code }, error.code === "NOT_FOUND" ? 404 : 409);
    }
    return c.json({ success: false, code: "OTA_REGISTRY_UNAVAILABLE" }, 503);
  }
});
