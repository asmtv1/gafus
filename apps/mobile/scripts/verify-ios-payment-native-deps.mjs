#!/usr/bin/env node
/** Fail closed if external payment provider's native SDK is linked to an iOS binary. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export function inspectIosPaymentNativeDependencies(directory=root){
  const files=["ios/Podfile","ios/Podfile.lock","ios/Gafus.xcodeproj/project.pbxproj"];
  const nativeForbidden=[/(?:^|[^a-z])(?:yookassa|yoomoney)(?:[^a-z]|$)/i,/git\.yoomoney\.ru/i];
  // Generated native dirs are deliberately git-ignored. A pristine CI checkout
  // must still enforce the config-plugin registration; it cannot claim to
  // have inspected non-existent native code.
  const generated=files.map(file=>fs.existsSync(path.join(directory,file)));
  if(!generated.some(Boolean)){
    if(directory===root){
      const config=JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8"));
      if(!config.expo?.plugins?.includes("./plugins/withIosStoreKitOnlyPodfile"))
        throw Error("IOS_STOREKIT_PODFILE_PLUGIN_MISSING");
    }
    return {ok:true,mode:"CONFIG_PLUGIN_ONLY",filesInspected:0};
  }
  if(!generated.every(Boolean))throw Error("INCOMPLETE_IOS_NATIVE_CONFIG");
  for(const file of files){
    const local=path.join(directory,file);
    const source=fs.readFileSync(local,"utf8");
    if(nativeForbidden.some(pattern=>pattern.test(source)))
      throw Error(`IOS_EXTERNAL_PAYMENT_NATIVE_DEPENDENCY_FORBIDDEN:${file}`);
  }
  return {ok:true,mode:"GENERATED_NATIVE_FILES",filesInspected:files.length};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try { console.log(JSON.stringify(inspectIosPaymentNativeDependencies()));}
  catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
