import { parsePrivateMediaLocation, signPrivateUserMedia,
  questionsV2IsMarker, questionsV2SignedRead, questionsV2Marker, questionsV2Delivery
} from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";
import type { QuestionPhotoDto } from "@gafus/types";

/** DB stores an immutable provider marker; the authorized DTO gets an expiring URL. */
export async function presentQuestionPhotoUrl(location: string): Promise<string> {
  if (!location) return "";
  if (questionsV2IsMarker(location)) return questionsV2SignedRead(location);
  return parsePrivateMediaLocation(location) ? signPrivateUserMedia(location) : location;
}

/** Authorized caller has already enforced question/answer visibility.
 * Never store expiring URLs in DB. Read actual WebP dimensions from manifest. */
export async function presentQuestionPhoto(photo:{id:string;url:string}):Promise<QuestionPhotoDto|null>{
  // A confirmed upload may already be attached to a published draft.
  // Return its ID and a non-renderable status so clients can recheck readiness.
  if (!photo.url) {
    const task=await prisma.questionV2MediaTask.findUnique({where:{photoId:photo.id}});
    if (!task || !["QUEUED","PROCESSING","AWAITING_UPLOAD","FAILED"].includes(task.status))
      return null;
    return {id:photo.id,url:"",status:task.status as QuestionPhotoDto["status"]};
  }
  if (!questionsV2IsMarker(photo.url)) {
    try {
      return {id:photo.id,url:await presentQuestionPhotoUrl(photo.url)};
    } catch (error) {
      // A restored discussion may reference another environment's private store.
      // Keep its text readable without signing against the wrong provider or
      // exposing the immutable private locator to either client.
      if (error instanceof Error && error.message === "PRIVATE_MEDIA_PROVIDER_MISMATCH")
        // Legacy data from a different provider was NOT processed by V2.
        return {id:photo.id,url:"",status:"UNAVAILABLE"};
      throw error;
    }
  }
  const task=await prisma.questionV2MediaTask.findUnique({where:{photoId:photo.id}});
  if(!task || task.status!=="READY" || !task.manifest)return null;
  const variants=(task.manifest as {variants:{
    small:{key:string;width:number;height:number};
    medium:{key:string;width:number;height:number};
  }}).variants;
  const mediumDelivery=await questionsV2Delivery(photo.url);
  const smallDelivery=await questionsV2Delivery(questionsV2Marker(variants.small.key));
  const url=mediumDelivery.url, smallUrl=smallDelivery.url;
  return {id:photo.id,url,smallUrl,
    ...(mediumDelivery.fallbackUrl ? {fallbackUrl:mediumDelivery.fallbackUrl,
      fallbackSmallUrl:smallDelivery.fallbackUrl} : {}),status:"READY" as const,width:variants.medium.width,height:variants.medium.height,
    smallWidth:variants.small.width,smallHeight:variants.small.height};
}
