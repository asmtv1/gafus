#!/usr/bin/env node
/** Read-only release CLI: verify a local receipt, never upload symbols. */
import fs from 'node:fs';
import path from 'node:path';
import {planPrivateSymbolUpload} from './upload-mobile-private-symbols.mjs';
function required(ok,code){if(!ok)throw Error(`OTA_NATIVE_VERIFICATION_${code}`);}
function verifyEmbeddedSymbolReceipt(directory,native,embeddedUpdateId,artifactSha256) {
  const plan=planPrivateSymbolUpload(directory);
  const manifestRecord=plan.records.at(-1);
  const manifest=JSON.parse(fs.readFileSync(manifestRecord.file,'utf8'));
  required(manifest.revision===0&&manifest.environment===native.environment&&
    manifest.platform===native.platform&&manifest.runtimeVersion===native.runtimeVersion&&
    manifest.sourceSha===native.sourceSha&&manifest.updateId===embeddedUpdateId&&
    manifest.nativeBuild===native.buildNumber&&manifest.nativeArtifactSha256===artifactSha256,
    'EMBEDDED_SYMBOL_SCOPE_MISMATCH');
  const receiptFile=path.join(path.resolve(directory),'private-symbol-delivery-evidence.json');
  const stat=fs.lstatSync(receiptFile);
  required(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size<100000,
    'EMBEDDED_SYMBOL_RECEIPT_INSECURE');
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  required(receipt.state==='IMMUTABLE_PRIVATE_SYMBOLS_VERIFIED'&&receipt.environment===manifest.environment&&
    receipt.platform===manifest.platform&&receipt.runtimeVersion===manifest.runtimeVersion&&
    receipt.updateId===manifest.updateId&&receipt.sourceSha===manifest.sourceSha&&
    receipt.manifestSha256===manifestRecord.sha256&&Array.isArray(receipt.report)&&
    receipt.report.length===plan.records.length&&plan.records.every(record=>
      receipt.report.filter(item=>item.verified===true&&item.key===record.key&&
        item.sha256===record.sha256&&item.size===record.size).length===1),
    'EMBEDDED_SYMBOL_RECEIPT_MISMATCH');
  return 'symbols-s3:'+manifestRecord.sha256;
}
try {
  const {directory,native,embeddedUpdateId,artifactSha256}=JSON.parse(fs.readFileSync(0,'utf8'));
  const ref=verifyEmbeddedSymbolReceipt(directory,native,embeddedUpdateId,artifactSha256);
  console.log(ref);
} catch (error) {
  // Emit only known validation codes, never filenames, manifest data or secrets.
  const code=error instanceof Error&&/^(?:SYMBOLS_[A-Z_]+|OTA_NATIVE_VERIFICATION_[A-Z_]+)$/.test(error.message)
    ? error.message : 'OTA_NATIVE_VERIFICATION_EMBEDDED_SYMBOL_RECEIPT_READ_FAILED';
  console.error(code);
  process.exitCode=1;
}
