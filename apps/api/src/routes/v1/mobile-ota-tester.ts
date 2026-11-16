/** Authenticated grant issuance; never trust usernames or roles in the request body. */
import { Hono } from 'hono';
import { z } from 'zod/v3';
import { prisma } from '@gafus/prisma';
import { issueOtaTesterGrant, OTA_TESTER_ACCOUNTS } from '@gafus/mobile-ota-server/tester-access';

const input=z.object({
  installationId:z.string().uuid(),
  platform:z.enum(['ios','android']),runtimeVersion:z.string().regex(/^\d+\.\d+\.\d+$/),
  nativeFingerprint:z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
export const mobileOtaTesterRoutes=new Hono();
mobileOtaTesterRoutes.use('*',async(c,next)=>{
  c.header('Cache-Control','private, no-store');
  c.header('Referrer-Policy','no-referrer');
  await next();
});
mobileOtaTesterRoutes.post('/grant',async(c)=>{
  if(process.env.MOBILE_OTA_DELIVERY_ENV!=='production')
    return c.json({success:false,code:'OTA_TESTING_DISABLED'},404);
  const parsed=input.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return c.json({success:false,code:'INVALID_INSTALLATION_ID'},400);
  const userId=c.get('user').id;
  try {
    const user=await prisma.user.findUnique({where:{id:userId},select:{username:true}});
    if(!user || !OTA_TESTER_ACCOUNTS.some(name=>name===user.username))
      return c.json({success:false,code:'OTA_NOT_TESTER'},403);
    const token=issueOtaTesterGrant({userId,username:user.username,
      installationId:parsed.data.installationId,platform:parsed.data.platform,
      runtimeVersion:parsed.data.runtimeVersion,nativeFingerprint:parsed.data.nativeFingerprint},
      process.env.MOBILE_OTA_INSTALLATION_HASH_KEY??'');
    if(!token) return c.json({success:false,code:'OTA_GRANT_UNAVAILABLE'},503);
    return c.json({success:true,data:{token,expiresInSeconds:900}});
  }catch {return c.json({success:false,code:'OTA_GRANT_UNAVAILABLE'},503);}
});
