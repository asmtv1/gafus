/** Narrow read-only rendition manifest projection; caller must enforce question ACL. */
import {prisma} from "@gafus/prisma";

export async function readQuestionPhotoMediaTask(photoId:string){
  if (!photoId) return null;
  return prisma.questionV2MediaTask.findUnique({
    where:{photoId},select:{status:true,manifest:true},
  });
}
