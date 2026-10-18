import assert from 'node:assert/strict';
import { questionBucketPolicy, QUESTIONS_BUCKET, createBucket, smokeBucket } from './questions-public-provision.mjs';
const policy = questionBucketPolicy();
assert.equal(QUESTIONS_BUCKET, 'gafus-questions-public');
assert.deepEqual(policy.Statement, [{
  Sid: 'PublicReadOfPublishedQuestionPhotosOnly', Effect: 'Allow', Principal: '*',
  Action: 's3:GetObject',
  Resource: 'arn:aws:s3:::gafus-questions-public/questions/uploads/questions/*',
}]);
assert.ok(!JSON.stringify(policy).includes('s3:PutObject'));
assert.ok(!JSON.stringify(policy).includes('s3:ListBucket'));
let createCalls = 0;
await assert.rejects(createBucket({send: async (cmd) => {
  if (cmd.constructor.name === 'HeadBucketCommand') return { $metadata: {httpStatusCode: 200} };
  createCalls++; return {};
}}), /QUESTIONS_BUCKET_ALREADY_EXISTS_MANUAL_REVIEW_REQUIRED/);
assert.equal(createCalls, 0);
await assert.rejects(createBucket({send: async (cmd) => {
  if (cmd.constructor.name === 'HeadBucketCommand') throw Object.assign(new Error('access'), {$metadata:{httpStatusCode:403}});
  createCalls++; return {};
}}), /access/);
assert.equal(createCalls, 0);
// An unexpected public-access policy must block smoke before any upload.
await assert.rejects(smokeBucket({send: async (cmd) => {
  if (cmd.constructor.name === 'HeadBucketCommand') return {};
  if (cmd.constructor.name === 'GetBucketPolicyCommand') return {Policy: JSON.stringify({Statement:[{Effect:'Allow',Action:'s3:*'}]})};
  throw new Error('UNEXPECTED_S3_WRITE');
}}), /QUESTIONS_UNEXPECTED_BUCKET_POLICY/);
console.log('Questions S3 provisioning safety tests PASS');
