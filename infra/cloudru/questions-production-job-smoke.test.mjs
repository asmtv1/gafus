import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// This test NEVER imports or launches the production smoke entrypoint.
const smoke = readFileSync("infra/cloudru/questions-production-job-smoke.mjs", "utf8");

test("explicitly scoped Questions real-job smoke uses the private durable-work contract", () => {
  assert.match(smoke, /const work = "questions\/jobs\/pending\/questions\/"/);
  assert.match(smoke, /const candidates = \[path, work,/);
  assert.match(smoke, /QUESTIONS_SMOKE_PRIVATE_WORK_ENQUEUED/);
  assert.match(smoke, /if\(!acknowledged\)throw Error\("QUESTIONS_SMOKE_WORK_NOT_ACKNOWLEDGED"\)/);
  assert.match(smoke, /IfNoneMatch:"\*"/);
  assert.match(smoke, /QUESTIONS_SMOKE_UNEXPECTED_PUBLIC_WRITE/);
  assert.match(smoke, /QUESTIONS_SMOKE_JOB_NOT_EXPECTED/);
  assert.match(smoke, /QUESTIONS_REAL_JOB_E2E_RESULT/);
  assert.doesNotMatch(smoke, /DeleteBucketCommand|PutBucketPolicyCommand/);
});
