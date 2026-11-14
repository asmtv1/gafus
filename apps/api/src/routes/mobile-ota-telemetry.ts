import { Hono } from "hono";
import { OtaBodyTooLargeError, readBoundedOtaJson } from "../modules/mobile-ota/bounded-json.js";
import { ingestOtaTelemetry, otaTelemetrySchema, OtaTelemetryError } from "@gafus/mobile-ota-server/telemetry";

/** Separate from signed Expo manifest, always bounded and anonymous. */
export const mobileOtaTelemetryRoutes = new Hono();
mobileOtaTelemetryRoutes.use("*", async(c,next)=>{
  c.header("Cache-Control","no-store");
  await next();
});
mobileOtaTelemetryRoutes.post("/telemetry",async(c)=>{
  const environment=process.env.MOBILE_OTA_DELIVERY_ENV;
  const secret=process.env.MOBILE_OTA_INSTALLATION_HASH_KEY;
  if ((environment!=="preview" && environment!=="production") || !secret || secret.length<32)
    return c.json({success:false,code:"OTA_TELEMETRY_DISABLED"},404);
  let input:unknown;
  try{input=await readBoundedOtaJson(c.req.raw);}
  catch(error){
    if(error instanceof OtaBodyTooLargeError)
      return c.json({success:false,code:"OTA_TELEMETRY_TOO_LARGE"},413);
    return c.json({success:false,code:"INVALID_OTA_TELEMETRY"},400);
  }
  const parsed=otaTelemetrySchema.safeParse(input);
  if(!parsed.success) return c.json({success:false,code:"INVALID_OTA_TELEMETRY"},400);
  try {
    const result=await ingestOtaTelemetry(parsed.data,environment,secret);
    return c.json({success:true,data:result},202);
  }catch(error){
    if(error instanceof OtaTelemetryError)
      return c.json({success:false,code:error.code},error.code==="TELEMETRY_QUOTA_EXCEEDED"?429:409);
    return c.json({success:false,code:"OTA_TELEMETRY_UNAVAILABLE"},503);
  }
});
