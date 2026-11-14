#!/usr/bin/env node
/** Fail-closed PUBLIC preview bundle environment. Never reads signing secrets. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const version=JSON.parse(fs.readFileSync(path.join(mobileRoot,"package.json"),"utf8")).version;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function otaTracerVersionName(appVersion,updateId) {
  if (!/^\d+\.\d+\.\d+$/.test(appVersion) || !UUID.test(updateId))
    throw Error("INVALID_OTA_APPTRACER_VERSION_INPUT");
  return `${appVersion}-ota.${updateId.replaceAll("-","").slice(0,12)}`;
}
function checkedPreviewOrigin(value,name) {
  if (typeof value!=="string" || !value.trim()) throw Error(`${name}_REQUIRED`);
  let url;
  try {url=new URL(value);}catch {throw Error(`${name}_INVALID`);}
  if (url.protocol!=="https:" || url.username || url.password ||
      url.pathname!=="/" || url.search || url.hash ||
      ["gafus.ru","api.gafus.ru"].includes(url.hostname))
    throw Error(`${name}_INVALID_OR_PRODUCTION`);
  return url.origin;
}
export function validatePreviewOtaExportEnv(env) {
  if (env.APP_ENV!=="preview" || env.GAFUS_OTA_TRANSPORT!=="self-hosted" ||
      !["ios","android"].includes(env.OTA_PLATFORM) ||
      env.GAFUS_OTA_TARGET_PLATFORM!==env.OTA_PLATFORM || env.OTA_RUNTIME!==version)
    throw Error("OTA_PREVIEW_EXPLICIT_NATIVE_ENV_REQUIRED");
  const apiOrigin=checkedPreviewOrigin(env.EXPO_PUBLIC_API_BASE_URL,"PREVIEW_API_ORIGIN");
  const chatOrigin=checkedPreviewOrigin(env.EXPO_PUBLIC_CHAT2_API_ORIGIN,"PREVIEW_CHAT2_ORIGIN");
  if (apiOrigin!==chatOrigin) throw Error("OTA_PREVIEW_API_CHAT_ORIGIN_MISMATCH");
  const expected=otaTracerVersionName(version,env.OTA_UPDATE_ID);
  if (env.EXPO_PUBLIC_APP_VERSION!==expected) throw Error("OTA_PREVIEW_APPTRACER_VERSION_MISMATCH");
  if (env.EXPO_PUBLIC_ENABLE_TRACER!=="true" ||
      typeof env.EXPO_PUBLIC_TRACER_APP_TOKEN_JS!=="string" ||
      env.EXPO_PUBLIC_TRACER_APP_TOKEN_JS.trim().length<8)
    throw Error("OTA_PREVIEW_JS_TRACER_NOT_CONFIGURED");
  const nativeToken=env.OTA_PLATFORM==="ios"
    ? env.EXPO_PUBLIC_TRACER_APP_TOKEN_IOS : env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID;
  if (typeof nativeToken!=="string" || nativeToken.trim().length<8)
    throw Error("OTA_PREVIEW_NATIVE_TRACER_NOT_CONFIGURED");
  return {ok:true,platform:env.OTA_PLATFORM,runtime:env.OTA_RUNTIME,
    apiOrigin,chatOrigin,tracerVersion:expected};
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  try {
    if(process.argv.length===4 && process.argv[2]==="--version") {
      console.log(otaTracerVersionName(version,process.argv[3]));
    } else if(process.argv.length===2) {
      console.log(JSON.stringify(validatePreviewOtaExportEnv(process.env)));
    } else throw Error("INVALID_OTA_PREVIEW_ENV_ARGUMENTS");
  } catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
