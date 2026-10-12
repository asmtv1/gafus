import assert from "node:assert/strict";
import { gafusBrowserCorsPolicy, mergeManagedCors } from "./s3-cors.mjs";
for (const bucket of ["gafus-gallery-private", "gafus-feed-private", "gafus-documents-private"]) {
  const rule = gafusBrowserCorsPolicy(bucket);
  assert(
    rule.AllowedOrigins.every(
      (origin) => origin === "https://gafus.ru" || origin === "https://www.gafus.ru",
    ),
  );
  assert(!rule.AllowedOrigins.includes("*"));
  assert(!rule.AllowedMethods.includes("DELETE"));
  if (bucket === "gafus-documents-private") assert(!rule.AllowedMethods.includes("POST"));
  else {
    assert(rule.AllowedMethods.includes("POST"));
    assert(!rule.AllowedMethods.includes("PUT"));
  }
}
assert.throws(() => gafusBrowserCorsPolicy("gafus-media"), /CLOUDRU_CORS_UNKNOWN_BUCKET/);
console.log("Cloud.ru CORS plan fixed origins and read-only documents PASS");

const other = { ID: "other-application", AllowedOrigins: ["https://other.example"], AllowedMethods: ["GET"] };
const prior = { ID: "gafus-browser-v1", AllowedOrigins: ["https://obsolete.example"], AllowedMethods: ["GET"] };
const merged = mergeManagedCors("gafus-gallery-private", [other, prior]);
assert.equal(merged.length, 2);
assert.deepEqual(merged[0], other);
assert.deepEqual(merged[1].AllowedOrigins, ["https://gafus.ru", "https://www.gafus.ru"]);
assert.equal(merged[1].AllowedOrigins.includes("*"), false);
assert.throws(() => mergeManagedCors("gafus-gallery-private", null), /CLOUDRU_CORS_UNREADABLE_RULES/);
assert.throws(() => mergeManagedCors("gafus-gallery-private", Array.from({length:100}, (_,i)=>({ID:`rule-${i}`}))), /CLOUDRU_CORS_RULE_LIMIT/);
console.log("Cloud.ru CORS merge retains unrelated rules and rejects rule overflow PASS");

const consoleManaged = { ...gafusBrowserCorsPolicy("gafus-gallery-private"), ID: undefined, AllowedMethods: ["GET", "HEAD", "POST", "PUT"] };
assert.deepEqual(mergeManagedCors("gafus-gallery-private", [consoleManaged]), [consoleManaged]);
assert.deepEqual(mergeManagedCors("gafus-gallery-private", [other, consoleManaged]), [other, consoleManaged]);
console.log("Cloud.ru CORS existing unnamed coverage is idempotent and keeps PUT compatibility PASS");
