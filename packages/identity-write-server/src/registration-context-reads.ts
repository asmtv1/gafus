/** Identity persistence only. Core owns registration consent, promo validation,
 * opaque-token hashing and VK context purpose decisions. All transactions
 * passed here are the original caller transactions: no nested transaction or
 * independent connection is allowed for atomic promo+VK context creation.
 */
import {prisma,type Prisma} from '@gafus/prisma';

export async function withRegistrationTransaction<T>(
 action:(tx:Prisma.TransactionClient)=>Promise<T>,
 options?:{maxWait?:number;timeout?:number},
){
 return prisma.$transaction(action,options);
}
export async function readValidVkRegistrationContext(tokenHash:string){
 return prisma.vkRegistrationContext.findFirst({
  where:{contextTokenHash:tokenHash,purpose:'REGISTER',expiresAt:{gt:new Date()},completedAt:null},
  select:{codeVerifier:true},
 });
}
export async function readVkRegistrationConsentContext(tokenHash:string,stateHash:string){
 return prisma.vkRegistrationContext.findFirst({
  where:{contextTokenHash:tokenHash,stateHash,purpose:'REGISTER',expiresAt:{gt:new Date()}},
  select:{selectedPromoCodeValue:true,completedAt:true},
 });
}
export async function readVkRegistrationPendingUsername(tokenHash:string,stateHash:string){
 const row=await prisma.vkRegistrationContext.findFirst({
  where:{contextTokenHash:tokenHash,stateHash,purpose:'REGISTER',expiresAt:{gt:new Date()}},
  select:{user:{select:{username:true}}},
 });
 return row?.user?.username??null;
}
/** A registrationPending user is not authorized to use protected endpoints. */
export async function readIsRegistrationCompleted(userId:string){
 const row=await prisma.user.findUnique({where:{id:userId},select:{registrationPending:true}});
 return Boolean(row&&!row.registrationPending);
}
export async function readVkLinkedAccountUsername(userId:string){
 const row=await prisma.user.findUnique({where:{id:userId},select:{username:true}});
 return row?.username??null;
}
