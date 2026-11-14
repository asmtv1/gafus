const {test}=require("node:test");
const assert=require("node:assert/strict");
const {patchPodfileForStoreKit}=require("./withIosStoreKitOnlyPodfile");
test("removes unused private CocoaPods payment repo on every iOS prebuild",()=>{
  const source="source 'https://cdn.cocoapods.org/'\nsource 'https://git.yoomoney.ru/scm/sdk/cocoa-pod-specs.git'\nplatform :ios, '15.1'\n";
  const patched=patchPodfileForStoreKit(source);
  assert.equal(patched,"source 'https://cdn.cocoapods.org/'\nplatform :ios, '15.1'\n");
  assert.equal(patchPodfileForStoreKit(patched),patched);
});
test("keeps standard pods and other legitimate native dependencies",()=>{
  const source="source 'https://github.com/odnoklassniki/tracer-ios.git'\npod 'VoximplantCore', '3.3.0'\n";
  assert.equal(patchPodfileForStoreKit(source),source);
});
test("rejects actual external payment native SDK rather than silently unlinking",()=>{
  assert.throws(()=>patchPodfileForStoreKit("pod 'YooKassa', '1.0'\n"),/IOS_YOOKASSA_NATIVE_POD_FORBIDDEN/);
});
