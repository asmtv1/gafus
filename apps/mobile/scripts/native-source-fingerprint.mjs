/** Stable native configuration fingerprint, independent of JS-only OTA sources. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const nativeFiles = new Set([
  "pnpm-lock.yaml", "apps/mobile/app.json", "apps/mobile/app.config.js",
  "apps/mobile/eas.json", "apps/mobile/package.json", "apps/mobile/metro.config.js",
  "apps/mobile/babel.config.js", "apps/mobile/expo-env.d.ts",
]);
const nativePrefixes = ["apps/mobile/ios/", "apps/mobile/android/",
  "apps/mobile/modules/", "apps/mobile/plugins/", "apps/mobile/native/"];
const ignoreParts = ["node_modules", "build", ".gradle", "Pods", "DerivedData", "xcuserdata"];
const hex = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function required(value, error) {if(!value)throw Error(error);}
function allowed(file) {
  if (file.split("/").some(p=>!p || p==="." || p===".." || ignoreParts.includes(p))) return false;
  if (nativeFiles.has(file)) return true;
  return nativePrefixes.some(prefix=>file.startsWith(prefix));
}
export function computeNativeSourceFingerprint(repositoryRoot, nativeProfile) {
  const root=path.resolve(repositoryRoot);
  const paths=["pnpm-lock.yaml","apps/mobile/app.json","apps/mobile/app.config.js",
    "apps/mobile/eas.json","apps/mobile/package.json","apps/mobile/metro.config.js",
    "apps/mobile/babel.config.js","apps/mobile/expo-env.d.ts",
    ...nativePrefixes.map(p=>p.slice(0,-1))];
  // The fingerprint must reflect the actual local build input. `--cached`
  // alone omits brand-new native config plugins before git add/commit.
  // Untracked ignored ios/ and android/ build outputs remain excluded.
  const gitFiles=(args)=>execFileSync("git",["ls-files",...args,"-z","--",...paths],
    {cwd:root,maxBuffer:8*1024*1024}).toString("utf8").split("\0").filter(allowed);
  const files=[...new Set([...gitFiles(["--cached"]),
    ...gitFiles(["--others","--exclude-standard"])])].sort();
  required(files.length>5,"NATIVE_FINGERPRINT_NO_TRACKED_FILES");
  const profile=nativeProfile && typeof nativeProfile==="object" && !Array.isArray(nativeProfile)
    ? nativeProfile : null;
  required(profile && ["ios","android"].includes(profile.platform) &&
    ["preview","production"].includes(profile.environment) &&
    typeof profile.runtimeVersion==="string" &&
    typeof profile.signingKeyId==="string" &&
    typeof profile.certificateSha256==="string" &&
    typeof profile.updateUrl==="string" &&
    typeof profile.channel==="string" &&
    profile.appVersion===profile.runtimeVersion,
  "NATIVE_FINGERPRINT_PROFILE_MISSING");
  const header=JSON.stringify({version:1,platform:profile.platform,
    environment:profile.environment,channel:profile.channel,
    runtimeVersion:profile.runtimeVersion,appVersion:profile.appVersion,
    signingKeyId:profile.signingKeyId,certificateSha256:profile.certificateSha256,
    updateUrl:profile.updateUrl});
  const hash=crypto.createHash("sha256");
  hash.update("GAFUS_NATIVE_SOURCE_FINGERPRINT_V1\n");
  hash.update(header+"\n");
  for (const file of files) {
    const full=path.join(root,file);
    const info=fs.lstatSync(full);
    if(!info.isFile() || info.isSymbolicLink()) throw Error("NATIVE_FINGERPRINT_SYMLINK_OR_MISSING");
    hash.update(file+"\0"+hex(fs.readFileSync(full))+"\n");
  }
  return {fingerprint:hash.digest("hex"),fileCount:files.length,version:1};
}
if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const [root,descriptor]=process.argv.slice(2);
    if(!root || !descriptor || process.argv.length!==4) throw Error("USAGE: native-source-fingerprint.mjs repoRoot nativeDescriptor.json");
    const value=computeNativeSourceFingerprint(root,JSON.parse(fs.readFileSync(descriptor,"utf8")));
    console.log(JSON.stringify(value));
  } catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}
