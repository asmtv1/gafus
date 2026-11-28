import {previewVersionPublication,publishVersionUpdate,PublicationError} from "@gafus/mobile-ota-server/version-publication";
import { Hono } from "hono";
import { listMandatoryOtaControls, updateMandatoryOtaControl, MandatoryControlError } from "@gafus/mobile-ota-server/mandatory-control";
import { listOtaTelemetrySummaries, listOtaDiagnosticQuality } from "@gafus/mobile-ota-server/telemetry";
import { listNativeOtaAudit, listNativeOtaReleases, listMobileOtaReleases, listMobileOtaPatchDefinitions, listMobileOtaAudit } from "@gafus/mobile-ota-server/queries";
import { patchDefinitionSchema, patchApplicationSchema, MobileOtaPatchError,
  registerSourcePatchDefinition, registerSourcePatchApplication,
  listSourcePatchApplications,
} from "@gafus/mobile-ota-server/patch-commands";
import {
  nativeReleaseInput, verifyNativeInput, MobileOtaNativeError,
  registerNativeCandidate, verifyNativeCandidate,
} from "@gafus/mobile-ota-server/native-release-admin";
import { z } from "zod/v3";
import { requireRole } from "../../middleware/auth.js";
import { readAdminActorRole } from "../../modules/admin-users/composition/service.js";
import {
  listMobileOtaDeployments, MobileOtaDeploymentError, updateMobileOtaDeployment,
  createMobileOtaDeployment,
} from "@gafus/mobile-ota-server/deployment-commands";

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
const versionScope = z.object({platform:z.enum(["ios","android"]),runtimeVersion:z.string().max(32).regex(/^\d+\.\d+\.\d+$/)});
adminMobileOtaRoutes.get("/version-publication/:platform/:runtimeVersion",async c=>{
  const scope=versionScope.safeParse(c.req.param());
  if(!scope.success)return c.json({success:false,error:"Укажите платформу и точную версию приложения."},400);
  return c.json({success:true,data:await previewVersionPublication(scope.data)});
});
const publishInput=versionScope.extend({action:z.enum(["TEST","ALL","RECOVER","MANDATORY"]),required:z.boolean(),
  key:z.string().regex(/^[a-f0-9]{64}$/).nullable(),token:z.string().regex(/^[a-f0-9]{64}$/),operationId:UUID}).strict();
adminMobileOtaRoutes.post("/version-publication",async c=>{
  const input=publishInput.safeParse(await c.req.json().catch(()=>null));
  if(!input.success)return c.json({success:false,error:"Проверьте параметры выпуска."},400);
  try{return c.json({success:true,data:await publishVersionUpdate({...input.data,actorId:c.get("user").id})});}
  catch(e){return c.json({success:false,error:e instanceof PublicationError?e.message:"Не удалось завершить выпуск. Обновите проверку."},409);}
});
/** Dedicated per-platform and per-native-runtime mandatory OTA controls for 1.7.5+.
 * Auth, server-side role recheck, CAS revision and deployment evidence are mandatory. */
const mandatoryControlInput = z.object({
  platform:z.enum(['ios','android']),
  runtimeVersion:z.string().regex(/^\d+\.\d+\.\d+$/),
  required:z.boolean(),
  version:z.string().max(100).nullable(),
  expectedRevision:z.number().int().nonnegative(),
  operationId:z.string().min(16).max(120).regex(/^[A-Za-z0-9_-]+$/),
  reason:z.string().trim().min(8).max(512),
}).strict();
adminMobileOtaRoutes.get("/mandatory-policies",async(c)=>{
  try {return c.json({success:true,data:await listMandatoryOtaControls()});}
  catch {return c.json({success:false,code:"MANDATORY_POLICY_UNAVAILABLE"},503);}
});
adminMobileOtaRoutes.put("/mandatory-policies",async(c)=>{
  const parsed=mandatoryControlInput.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({success:false,code:"MANDATORY_COMMAND_INVALID"},400);
  try {
    const result=await updateMandatoryOtaControl({...parsed.data,actorId:c.get("user").id});
    return c.json({success:true,data:result});
  }catch(error){
    if(error instanceof MandatoryControlError)
      return c.json({success:false,code:error.code},error.code==="FORBIDDEN"?403:409);
    return c.json({success:false,code:"MANDATORY_POLICY_UNAVAILABLE"},503);
  }
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
adminMobileOtaRoutes.get("/diagnostic-quality", async(c)=>{
  try{return c.json({success:true,data:await listOtaDiagnosticQuality()});}
  catch{return c.json({success:false,code:"OTA_DIAGNOSTIC_QUALITY_UNAVAILABLE"},503);}
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
