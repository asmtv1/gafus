/** Authenticated grant issuance; never trust usernames or roles in the request body. */
import { Hono } from 'hono';
import { z } from 'zod/v3';
import { issueRegisteredTesterGrant } from '@gafus/mobile-ota-server/tester-grant-service';

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
    const result=await issueRegisteredTesterGrant(userId,parsed.data,
      process.env.MOBILE_OTA_INSTALLATION_HASH_KEY??'');
    if(result.status==='not_tester')return c.json({success:false,code:'OTA_NOT_TESTER'},403);
    if(result.status!=='granted')return c.json({success:false,code:'OTA_GRANT_UNAVAILABLE'},503);
    return c.json({success:true,data:{token:result.token,expiresInSeconds:result.expiresInSeconds}});
  }catch {return c.json({success:false,code:'OTA_GRANT_UNAVAILABLE'},503);}
});
