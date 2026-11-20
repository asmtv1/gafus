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
/** A registrationPending user is not authorized to use protected endpoints. */
export async function readIsRegistrationCompleted(userId:string){
 const row=await prisma.user.findUnique({where:{id:userId},select:{registrationPending:true}});
 return Boolean(row&&!row.registrationPending);
}
