/** Database-backed tester grant issuance lives in server package, never API routes. */
import { prisma } from '@gafus/prisma';
import { issueOtaTesterGrant, isOtaTesterAccount } from './tester-access.js';

export type TesterGrantRequest = Readonly<{
  installationId: string;
  platform: 'ios'|'android';
  runtimeVersion: string;
  nativeFingerprint: string;
}>;
export type TesterGrantResult =
  | {status:'granted';token:string;expiresInSeconds:900}
  | {status:'not_tester'}
  | {status:'unavailable'};

/** Server actor ID comes from the verified JWT. Username is always read afresh from DB. */
export async function issueRegisteredTesterGrant(
  actorId: string, request: TesterGrantRequest, secret: string,
): Promise<TesterGrantResult> {
  if (secret.length < 32) return {status:'unavailable'};
  const user=await prisma.user.findUnique({where:{id:actorId},select:{username:true}});
  if (!user || !isOtaTesterAccount(user.username)) return {status:'not_tester'};
  const token=issueOtaTesterGrant({userId:actorId,username:user.username,...request},secret);
  return token ? {status:'granted',token,expiresInSeconds:900} : {status:'unavailable'};
}
