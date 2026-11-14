/**
 * Private source patch registry. This NEVER changes any mobile OTA deployment.
 * Source checkout restoration requires a separate, reviewable native release.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { z } from "zod/v3";

const UUID=z.string().uuid();
const SHA=z.string().regex(/^[a-f0-9]{40}$/i);
const HASH=z.string().regex(/^[a-f0-9]{64}$/i);
const operationId=z.string().min(16).max(120).regex(/^[A-Za-z0-9_-]+$/);
const patchPath=z.string().min(5).max(256).regex(/^[A-Za-z0-9_.\/-]+$/)
  .refine(value=>!value.split("/").some(segment=>!segment || segment==="." || segment==="..") &&
    !value.endsWith(".sh") && !value.endsWith(".mjs"), "Unsafe patch target");
const permittedPath=/^(apps\/mobile\/src\/(?:features\/app-subscription|shared\/lib)\/|apps\/api\/src\/(?:routes\/v1\/app-subscription|modules\/app-subscription)\/|apps\/api\/src\/routes\/v1\/app-subscription\.(?:ts|test\.ts)$)/;
export const patchDefinitionSchema=z.object({
  operationId,
  version:z.string().regex(/^\d+\.\d+\.\d+$/),
  sha256:HASH,
  allowedBases:z.array(SHA).min(1).max(40).refine(values=>new Set(values).size===values.length),
  allowedPaths:z.array(patchPath.refine(p=>permittedPath.test(p))).min(1).max(40)
    .refine(values=>new Set(values).size===values.length),
  nativeRequirements:z.object({
    publication:z.literal("NEW_NATIVE_BUILD_AND_APP_REVIEW"),
    targetPlatform:z.literal("ios"),
    minimumVersion:z.string().regex(/^\d+\.\d+\.\d+$/),
    otaCompatible:z.literal(false),
  }).strict(),
  sourceLocation:z.string().regex(/^private:\/\/mobile-patches\/[a-zA-Z0-9_.-]+\.patch$/).max(512),
}).strict();
export const patchApplicationSchema=z.object({
  patchDefinitionId:UUID,
  nativeReleaseId:UUID,
  baseSha:SHA,
  operationId,
}).strict();
export class MobileOtaPatchError extends Error {
  constructor(public readonly code:string) {super(code);}
}
function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      const record = entry as Record<string,unknown>;
      return Object.fromEntries(Object.keys(record).sort().map(key=>[key,normalize(record[key])]));
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}
type RegisteredSourcePatch = {
  id:string;operationId:string|null;sha256:string;version:string;
  allowedBases:string[];allowedPaths:string[];
  nativeRequirements: Record<string,unknown>;sourceLocation:string;
};
function sourcePatchIsIdentical(
  row:RegisteredSourcePatch,input:z.infer<typeof patchDefinitionSchema>,actorId:string,
): boolean {
  const {registeredBy,operationId:registeredOperationId,...nativeRequirements}=row.nativeRequirements;
  return row.operationId===input.operationId && row.sha256===input.sha256 &&
    row.version===input.version && row.sourceLocation===input.sourceLocation &&
    JSON.stringify(row.allowedBases)===JSON.stringify(input.allowedBases) &&
    JSON.stringify(row.allowedPaths)===JSON.stringify(input.allowedPaths) &&
    canonicalJson(nativeRequirements)===canonicalJson(input.nativeRequirements) &&
    registeredBy===actorId && registeredOperationId===input.operationId;
}
export async function registerSourcePatchDefinition(input:z.infer<typeof patchDefinitionSchema>,actorId:string) {
  return prisma.$transaction(async tx=>{
    const existing=await tx.$queryRaw<RegisteredSourcePatch[]>`
      SELECT id, "operationId", sha256, version, "allowedBases", "allowedPaths",
        "nativeRequirements", "sourceLocation"
      FROM "MobilePatchDefinition"
      WHERE sha256=${input.sha256} OR "operationId"=${input.operationId}
      FOR UPDATE
    `;
    if(existing.length) {
      if(existing.length!==1 || !sourcePatchIsIdentical(existing[0],input,actorId))
        throw new MobileOtaPatchError("SOURCE_PATCH_OPERATION_CONFLICT");
      return {id:existing[0].id,state:"PRIVATE_SOURCE_ONLY" as const,replayed:true};
    }
    const id=randomUUID();
    const inserted=await tx.$queryRaw<{id:string}[]>`
      INSERT INTO "MobilePatchDefinition"
      (id, "operationId", version, sha256, "allowedBases", "allowedPaths", "nativeRequirements", "sourceLocation")
      VALUES (${id}::uuid,${input.operationId},${input.version},${input.sha256},
        ${JSON.stringify(input.allowedBases)}::jsonb,${JSON.stringify(input.allowedPaths)}::jsonb,
        ${JSON.stringify({...input.nativeRequirements,registeredBy:actorId,operationId:input.operationId})}::jsonb,
        ${input.sourceLocation})
      ON CONFLICT DO NOTHING RETURNING id
    `;
    if(inserted[0]) return {id,state:"PRIVATE_SOURCE_ONLY" as const,replayed:false};
    // A competing registration committed while this transaction was waiting
    // on the unique key. Re-read and accept only a byte-equivalent request.
    const concurrent=await tx.$queryRaw<RegisteredSourcePatch[]>`
      SELECT id, "operationId", sha256, version, "allowedBases", "allowedPaths",
        "nativeRequirements", "sourceLocation"
      FROM "MobilePatchDefinition"
      WHERE sha256=${input.sha256} OR "operationId"=${input.operationId}
    `;
    if(concurrent.length!==1 || !sourcePatchIsIdentical(concurrent[0],input,actorId))
      throw new MobileOtaPatchError("SOURCE_PATCH_OPERATION_CONFLICT");
    return {id:concurrent[0].id,state:"PRIVATE_SOURCE_ONLY" as const,replayed:true};
  });
}
export async function registerSourcePatchApplication(input:z.infer<typeof patchApplicationSchema>,actorId:string) {
  return prisma.$transaction(async tx=>{
    const old=await tx.$queryRaw<{
      id:string; patchDefinitionId:string;nativeReleaseId:string;baseSha:string;initiatedById:string;state:string;
    }[]>`
      SELECT id,"patchDefinitionId","nativeReleaseId","baseSha","initiatedById",state
      FROM "MobilePatchApplication" WHERE "operationId"=${input.operationId}
    `;
    if(old[0]) {
      if(old[0].patchDefinitionId!==input.patchDefinitionId ||
        old[0].nativeReleaseId!==input.nativeReleaseId || old[0].baseSha!==input.baseSha ||
        old[0].initiatedById!==actorId) throw new MobileOtaPatchError("SOURCE_PATCH_OPERATION_CONFLICT");
      return {id:old[0].id,state:old[0].state,replayed:true};
    }
    const matches=await tx.$queryRaw<{
      id:string;sha256:string;allowedBases:string[];
      nativeRequirements:{publication:string;targetPlatform:string;otaCompatible:boolean};
      platform:string;sourceSha:string;verified:boolean;
    }[]>`
      SELECT p.id, p.sha256, p."allowedBases", p."nativeRequirements",
        n.platform, n."sourceSha", n.verified
      FROM "MobilePatchDefinition" p
      JOIN "MobileNativeRelease" n ON n.id=${input.nativeReleaseId}::uuid
      WHERE p.id=${input.patchDefinitionId}::uuid
    `;
    const m=matches[0];
    if(!m || !m.verified || m.platform!=="ios" ||
      !m.allowedBases.includes(input.baseSha) || m.sourceSha!==input.baseSha ||
      m.nativeRequirements.publication!=="NEW_NATIVE_BUILD_AND_APP_REVIEW" ||
      m.nativeRequirements.otaCompatible!==false)
      throw new MobileOtaPatchError("SOURCE_PATCH_NOT_APPLICABLE");
    const id=randomUUID();
    const checks=JSON.stringify({requiresAppReview:true,publishedAsOta:false,sourcePatchSha256:m.sha256});
    await tx.$executeRaw`
      INSERT INTO "MobilePatchApplication"
       (id,"patchDefinitionId","nativeReleaseId","baseSha","operationId",state,"initiatedById",checks,"updatedAt")
      VALUES (${id}::uuid,${input.patchDefinitionId}::uuid,${input.nativeReleaseId}::uuid,
        ${input.baseSha},${input.operationId},'DRAFT',${actorId},${checks}::jsonb,NOW())
    `;
    return {id,state:"DRAFT",replayed:false};
  });
}
export async function listSourcePatchApplications() {
  return prisma.$queryRaw<unknown[]>`
    SELECT a.id,a."patchDefinitionId",a."nativeReleaseId",a."baseSha",a."resultSha",
      a."operationId",a.state,a."initiatedById",a.checks,a."createdAt",a."updatedAt",
      p.version,p.sha256,n.platform,n."appVersion",n."runtimeVersion"
    FROM "MobilePatchApplication" a
    JOIN "MobilePatchDefinition" p ON p.id=a."patchDefinitionId"
    JOIN "MobileNativeRelease" n ON n.id=a."nativeReleaseId"
    ORDER BY a."createdAt" DESC LIMIT 100
  `;
}
