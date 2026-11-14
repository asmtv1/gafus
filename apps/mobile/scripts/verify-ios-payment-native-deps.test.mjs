import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {inspectIosPaymentNativeDependencies} from "./verify-ios-payment-native-deps.mjs";
function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"gafus-ios-native-payment-qa-"));
  for(const f of ["ios/Podfile","ios/Podfile.lock","ios/Gafus.xcodeproj/project.pbxproj"]){
    fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});
    fs.writeFileSync(path.join(root,f),"# allowed StoreKit / Expo / Apple IAP\n");
  }
  try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("clean Expo checkout enforces plugin-only guard without claiming native inspection",()=>fixture(root=>{
  fs.rmSync(path.join(root,"ios"),{recursive:true,force:true});
  assert.deepEqual(inspectIosPaymentNativeDependencies(root),{ok:true,mode:"CONFIG_PLUGIN_ONLY",filesInspected:0});
}));
test("iOS native SDK dependency guard accepts StoreKit-only native checkout",()=>fixture(root=>{
  assert.deepEqual(inspectIosPaymentNativeDependencies(root),{ok:true,mode:"GENERATED_NATIVE_FILES",filesInspected:3});
}));
test("iOS native SDK dependency guard blocks an external payment CocoaPods source",()=>fixture(root=>{
  fs.appendFileSync(path.join(root,"ios/Podfile"),"source 'https://git.yoomoney.ru/scm/sdk/cocoa-pod-specs.git'\n");
  assert.throws(()=>inspectIosPaymentNativeDependencies(root),/IOS_EXTERNAL_PAYMENT_NATIVE_DEPENDENCY_FORBIDDEN/);
}));
test("iOS native SDK dependency guard blocks a linked YooKassa SDK",()=>fixture(root=>{
  fs.appendFileSync(path.join(root,"ios/Podfile.lock")," - YooKassa (1.0.0)\n");
  assert.throws(()=>inspectIosPaymentNativeDependencies(root),/IOS_EXTERNAL_PAYMENT_NATIVE_DEPENDENCY_FORBIDDEN/);
}));
