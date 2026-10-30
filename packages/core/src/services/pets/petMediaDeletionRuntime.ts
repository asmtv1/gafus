/** WEB2 opt-in local-only worker entry. Never drains a production or another
 * owner's queue. This is inactive until the additive outbox migration exists
 * and an isolated development worker is explicitly activated.
 */
import { prisma } from "@gafus/prisma";
import { deletePrivateUserMedia, deleteIsolatedAvatarLocation } from "@gafus/cdn-upload";
import {runOnePetMediaDeletionSql} from "./petMediaDeletionSql";
import type {PetMediaProvider} from "./petMediaDeletionOutbox";

export function petMediaWorkerAllowed(env:NodeJS.ProcessEnv=process.env):boolean {
  const flags=[env.PET_MEDIA_DELETION_OUTBOX_ENABLED,env.PET_MEDIA_CLEANUP_WORKER_ENABLED];
  if(flags.some(value=>value!==undefined&&value!=="true"&&value!=="false"))
    throw Error("PET_MEDIA_WORKER_CONFIG_INVALID");
  if(flags[0]!=="true"||flags[1]!=="true")return false;
  if(env.NODE_ENV!=="development"||env.GAFUS_LOCAL_ISOLATED_API!=="1"||
    env.GAFUS_ISOLATED_NONPROD_S3!=="enabled")
    throw Error("PET_MEDIA_WORKER_ISOLATION_DENIED");
  return true;
}

/** No environment flag can turn a legacy/Yandex/Gallery object into a Cloud.ru
 * object. HEAD-verified provider adapters are already implemented in CDN-upload.
 * Legacy cleanup requires an independent provider-specific HEAD design. */
export async function deleteVerifiedPetMediaObject(
  provider:PetMediaProvider,locator:string,
):Promise<void>{
  if(provider==="cloudru-documents")return deletePrivateUserMedia(locator);
  if(provider==="isolated-avatar")return deleteIsolatedAvatarLocation(locator);
  throw Error("PET_MEDIA_LEGACY_HEAD_VERIFICATION_REQUIRED");
}
let running=false;
export async function processDuePetMediaDeletionIntents(limit=3):Promise<number>{
  if(!petMediaWorkerAllowed())return 0;
  if(!Number.isInteger(limit)||limit<1||limit>10)throw Error("PET_MEDIA_INVALID_BATCH_LIMIT");
  if(running)return 0;
  running=true;
  try{
    let handled=0;
    for(let i=0;i<limit;i++){
      const status=await runOnePetMediaDeletionSql(prisma as never,deleteVerifiedPetMediaObject);
      if(status==="empty")break;
      handled++;
    }
    return handled;
  }finally{running=false;}
}
