/** Authenticated grant issuance; never trust usernames or roles in the request body. */
import { Hono } from 'hono';
import { z } from 'zod/v3';
import { issueRegisteredTesterGrant } from '@gafus/mobile-ota-server/tester-grant-service';
import { isRegisteredOtaTester } from '@gafus/mobile-ota-server/tester-grant-service';
import { getVerifiedNativeOtaSigningKeyId, resolvePublishedOtaSelection } from '@gafus/mobile-ota-server/repository';
import { resolveMandatoryOtaPolicy } from '@gafus/mobile-ota-server/mandatory-policy';
import { getMandatoryOtaControl, supportsMandatoryOta } from '@gafus/mobile-ota-server/mandatory-control';

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

/** The exact *same* cohort selection as the signed Expo manifest endpoint.
 * A global "required" flag alone may NEVER lock out users assigned to the
 * previous release (or zero-percent non-testers). This route is authenticated.
 */
const mandatoryInput = input;

mobileOtaTesterRoutes.post('/mandatory-policy', async(c) => {
  if (process.env.MOBILE_OTA_DELIVERY_ENV !== 'production')
    return c.json({success:false,code:'OTA_POLICY_DISABLED'},404);
  const parsed=mandatoryInput.safeParse(await c.req.json().catch(()=>null));
  if (!parsed.success) return c.json({success:false,code:'OTA_INVALID_CONTEXT'},400);
  const {installationId,platform,runtimeVersion,nativeFingerprint}=parsed.data;
  try {
    // Exact platform + native runtime. No shared Android/iOS required flag.
    // Versions before 1.7.5 cannot be forced by the new signed-OTA policy.
    if (!supportsMandatoryOta(runtimeVersion))
      return c.json({success:true,data:{required:false,version:null,selectedRevision:null}});
    const policy=await getMandatoryOtaControl(platform,runtimeVersion);
    // Only query rollouts if a matching, explicit, native-compatible mandatory
    // policy exists. Optional updates still use the normal background path.
    let selectedRevision: number | null = null;
    if (policy?.required && policy.version && policy.channel === 'production' &&
        (policy.platform==='all'||policy.platform===platform) &&
        policy.version.startsWith(runtimeVersion+'-ota.')) {
      const secret=process.env.MOBILE_OTA_INSTALLATION_HASH_KEY??'';
      const verifiedTester=secret.length>=32 && await isRegisteredOtaTester(c.get('user').id);
      const nativeKeyId=await getVerifiedNativeOtaSigningKeyId({
        appId:'gafus',environment:'production',platform,runtimeVersion,
        nativeFingerprint:nativeFingerprint.toLowerCase(),
      });
      if (nativeKeyId) {
        const selected=await resolvePublishedOtaSelection({
          appId:'gafus',environment:'production',platform,runtimeVersion,
          channel:'production',keyId:nativeKeyId,nativeFingerprint:nativeFingerprint.toLowerCase(),
          installationId,testerAllowed:verifiedTester,
        });
        selectedRevision=selected?.revision??null;
      }
    }
    const result=resolveMandatoryOtaPolicy(policy,{platform,runtimeVersion,selectedRevision});
    return c.json({success:true,data:result});
  }catch {
    return c.json({success:false,code:'OTA_POLICY_UNAVAILABLE'},503);
  }
});
