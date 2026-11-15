#!/usr/bin/env node
/** Fail-closed PUBLIC preview bundle environment. Never reads signing secrets. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const version=JSON.parse(fs.readFileSync(path.join(mobileRoot,"package.json"),"utf8")).version;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function otaReleaseVersionName(appVersion,updateId) {
  if (!/^\d+\.\d+\.\d+$/.test(appVersion) || !UUID.test(updateId))
    throw Error("INVALID_OTA_RELEASE_VERSION_INPUT");
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
  const expected=otaReleaseVersionName(version,env.OTA_UPDATE_ID);
  if (env.EXPO_PUBLIC_APP_VERSION!==expected) throw Error("OTA_PREVIEW_RELEASE_VERSION_MISMATCH");
  if (env.EXPO_PUBLIC_TELEMETRY_ENABLED!=="true")
    throw Error("OTA_PREVIEW_GAFUS_TELEMETRY_REQUIRED");
  return {ok:true,platform:env.OTA_PLATFORM,runtime:env.OTA_RUNTIME,
    apiOrigin,chatOrigin,releaseVersion:expected};
}
/** Production exports use an API origin that differs from the OTA manifest host.
 * Source maps are uploaded to private Cloud.ru S3. */
export function validateProductionOtaExportEnv(env) {
  if (env.APP_ENV!=="production" || env.GAFUS_OTA_TRANSPORT!=="self-hosted" ||
      env.CI!=="true" || env.GAFUS_OTA_PRODUCTION_APPROVED!=="true" ||
      !["ios","android"].includes(env.OTA_PLATFORM) ||
      env.GAFUS_OTA_TARGET_PLATFORM!==env.OTA_PLATFORM || env.OTA_RUNTIME!==version)
    throw Error("OTA_PRODUCTION_EXPLICIT_NATIVE_ENV_REQUIRED");
  if (env.EXPO_PUBLIC_API_BASE_URL!=="https://api.gafus.ru" ||
      env.EXPO_PUBLIC_CHAT2_API_ORIGIN!=="https://api.gafus.ru")
    throw Error("OTA_PRODUCTION_API_ORIGIN_MISMATCH");
  const expected=otaReleaseVersionName(version,env.OTA_UPDATE_ID);
  if (env.EXPO_PUBLIC_APP_VERSION!==expected)
    throw Error("OTA_PRODUCTION_RELEASE_VERSION_MISMATCH");
  if (env.EXPO_PUBLIC_TELEMETRY_ENABLED!=="true")
    throw Error("OTA_PRODUCTION_GAFUS_TELEMETRY_REQUIRED");
  return {ok:true,platform:env.OTA_PLATFORM,runtime:env.OTA_RUNTIME,
    apiOrigin:env.EXPO_PUBLIC_API_BASE_URL,chatOrigin:env.EXPO_PUBLIC_CHAT2_API_ORIGIN,
    releaseVersion:expected};
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  try {
    if(process.argv.length===4 && process.argv[2]==="--version") {
      console.log(otaReleaseVersionName(version,process.argv[3]));
    } else if(process.argv.length===2) {
      console.log(JSON.stringify(process.env.APP_ENV==="production"
        ? validateProductionOtaExportEnv(process.env) : validatePreviewOtaExportEnv(process.env)));
    } else throw Error("INVALID_OTA_PREVIEW_ENV_ARGUMENTS");
  } catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
