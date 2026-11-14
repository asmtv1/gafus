/** Strictly owner-scoped, read-only prerequisites for Core access decisions. */
import {prisma} from "@gafus/prisma";

export async function readAccessActorRole(authenticatedUserId:string):Promise<string|null>{
  if (!authenticatedUserId) return null;
  const actor=await prisma.user.findUnique({
    where:{id:authenticatedUserId},select:{role:true},
  });
  return actor?.role??null;
}

/** ACTIVE alone is insufficient: only lifetime or unexpired periods grant access. */
export async function hasCurrentPaidSubscription(authenticatedUserId:string,now:Date):Promise<boolean>{
  if (!authenticatedUserId) return false;
  const subscription=await prisma.appSubscription.findFirst({
    where:{
      userId:authenticatedUserId,status:"ACTIVE",
      OR:[{isLifetime:true},{currentPeriodEnd:{gt:now}}],
    },select:{id:true},
  });
  return Boolean(subscription);
}

/** Private courses are never unlocked by paid subscription or global roles. */
export async function hasAssignedPrivateCourse(authenticatedUserId:string,courseId:string):Promise<boolean>{
  if (!authenticatedUserId || !courseId) return false;
  const assigned=await prisma.courseAccess.findFirst({
    where:{userId:authenticatedUserId,courseId},select:{courseId:true},
  });
  return Boolean(assigned);
}

/** One user + one article + unexpired 7-day grant, not a global subscription. */
export async function hasActiveGafusArticleAccess(
  authenticatedUserId:string,articleId:string,now:Date,
):Promise<boolean>{
  if (!authenticatedUserId || !articleId) return false;
  const unlocked=await prisma.gafusTargetAccess.findFirst({
    where:{
      userId:authenticatedUserId,targetType:"ARTICLE",targetKey:`article:${articleId}`,
      expiresAt:{gt:now},
    },select:{id:true},
  });
  return Boolean(unlocked);
}

/** A chat 'subscriber' badge requires a currently paid, unexpired period, not just an active trial. */
export async function hasPaidChatDisplaySubscription(authenticatedUserId:string,now:Date):Promise<boolean>{
  if(!authenticatedUserId)return false;
  const subscription=await prisma.appSubscription.findFirst({
    where:{
      userId:authenticatedUserId,status:"ACTIVE",
      OR:[{isLifetime:true},{currentPeriodEnd:{gt:now}}],
      payments:{some:{status:"SUCCEEDED",amount:{gt:0}}},
    },select:{id:true},
  });
  return Boolean(subscription);
}
