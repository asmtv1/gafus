// Only synthetic fixture stores are writable in the real-provider drill.
// The actual production archive config is never a valid input here.
import {validateConfig,must,scopes} from "../../ci-cd/scripts/external-backup/archive.mjs";
export function validateRealDrillConfig(raw) {
 const c=validateConfig(raw,false);
 must(Object.keys(c.sources).length===scopes.length,"QA_EXTERNAL_SCOPE_MISMATCH");
 must(typeof c.drillId==="string" && /^[a-f0-9]{12}$/.test(c.drillId),"QA_EXTERNAL_DRILL_ID_REQUIRED");
 const id=c.drillId;
 must(c.archive.bucket==="gafus-qa-archive-"+id && c.archive.profile==="qa-archive-"+id,"QA_EXTERNAL_ARCHIVE_NOT_ISOLATED");
 const profiles=new Set([c.archive.profile]);
 for(const scope of scopes){
  const source=c.sources[scope],target=c.targets[scope];
  must(source.bucket==="gafus-qa-source-"+id+"-"+scope &&
    target.bucket==="gafus-restore-"+id+"-"+scope &&
    source.profile==="qa-read-"+id+"-"+scope &&
    source.seedProfile==="qa-seed-"+id+"-"+scope &&
    target.profile==="qa-restore-"+id+"-"+scope,"QA_EXTERNAL_BUCKET_OR_PROFILE_NOT_ISOLATED");
  for(const profile of [source.profile,source.seedProfile,target.profile]){
   must(!profiles.has(profile),"QA_EXTERNAL_PROFILE_REUSED");profiles.add(profile);
  }
 }
 must(c.otaOrigin==="https://ota-restore.invalid/"+c.sources.ota.bucket,"QA_EXTERNAL_OTA_LOCATOR_INVALID");
 return c;
}
