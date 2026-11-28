import { createHash, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import assert from "node:assert/strict";
const hash=b=>createHash("sha256").update(b).digest("hex");
export async function otaFixture(dir,origin="https://example.test/ota-bucket",revision=1) {
 const keyPath=join(dir,"key.pem"),certPath=join(dir,"cert.pem");
 const req=spawnSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","3","-subj","/CN=GAFUS backup test","-addext","extendedKeyUsage=codeSigning","-keyout",keyPath,"-out",certPath],{stdio:"ignore"});
 assert.equal(req.status,0);
 const cert=(await readFile(certPath)).toString(),privateKey=await readFile(keyPath);
 const native="n",key="ota/production/gafus/1.7.6/ios/assets/bundle-"+revision,url=origin+"/"+key;
 const bytes=Buffer.from("actual signed test bundle "+revision),sha256=hash(bytes),sourceSha="a".repeat(40);
 const manifest={id:"update-"+revision,createdAt:new Date().toISOString(),runtimeVersion:"1.7.6",
   metadata:{environment:"production",channel:"production",sourceSha},
   extra:{ota:{revision}},launchAsset:{url,hash:Buffer.from(sha256,"hex").toString("base64url"),contentType:"application/javascript"},assets:[]};
 const body=Buffer.from(JSON.stringify(manifest)), signature=sign("RSA-SHA256",body,privateKey).toString("base64");
 const r={nativeReleaseId:native,updateId:manifest.id,revision,sourceSha,platform:"ios",environment:"production",channel:"production",
   runtimeVersion:"1.7.6",signingKeyId:"qa-key",manifestHex:body.toString("hex"),
   signatureHeader:'sig="'+signature+'", keyid="qa-key", alg="rsa-v1_5-sha256"',certificatePem:cert,certificateSha256:hash(cert),
   nativeFingerprint:"b".repeat(64),nativeVerified:true,nativePlatform:"ios",nativeEnvironment:"production",nativeChannel:"production",
   nativeRuntimeVersion:"1.7.6",nativeSigningKeyId:"qa-key",previous:revision===1,active:revision===2,
   artifacts:[{assetKey:"bundle-"+revision,url,sha256,mimeType:"application/javascript",sizeBytes:String(bytes.length),verified:true}]};
 return {r,key,bytes,trust:{"qa-key":[hash(cert)]},inventory:new Map([["ota\0"+key,{sha256,size:bytes.length}]])};
}
