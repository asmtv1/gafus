import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validatedPublicFeedPolicy, verifiedPublicFeedAccess } from './private-bucket-guard.mjs';
const allowed = { Version: '2012-10-17', Statement: [{
  Effect: 'Allow', Principal: '*', Action: 's3:GetObject',
  Resource: 'arn:aws:s3:::gafus-feed-private/posts/*/attachments/*',
}] };
const state = { BlockPublicAcls: true, IgnorePublicAcls: true,
  BlockPublicPolicy: false, RestrictPublicBuckets: false };
test('only exact final Feed GET policy is approved', () => {
  assert.equal(validatedPublicFeedPolicy(JSON.stringify(allowed)), true);
  for (const bad of [
    { ...allowed, Statement: [{ ...allowed.Statement[0], Action: 's3:*' }] },
    { ...allowed, Statement: [{ ...allowed.Statement[0], Resource: 'arn:aws:s3:::gafus-feed-private/*' }] },
    { ...allowed, Statement: [{ ...allowed.Statement[0], Resource: 'arn:aws:s3:::gafus-feed-private/posts/*/incoming/*' }] },
    { ...allowed, Statement: [{ ...allowed.Statement[0], Action: ['s3:GetObject', 's3:PutObject'] }] },
    { ...allowed, Statement: [{ ...allowed.Statement[0], Condition: { Bool: { 'aws:SecureTransport': 'false' } } }] },
    { ...allowed, Statement: [allowed.Statement[0], allowed.Statement[0]] },
    { ...allowed, Statement: [{ ...allowed.Statement[0], Principal: { AWS: 'arn:aws:iam::123456789012:root' } }] },
  ]) assert.equal(validatedPublicFeedPolicy(JSON.stringify(bad)), false);
});
test('checked-in policy template grants public GET only to final Feed objects', () => {
  const raw = readFileSync(new URL('./feed-public-bucket-policy.json', import.meta.url), 'utf8');
  assert.equal(validatedPublicFeedPolicy(raw), true);
});
test('accepts Cloud.ru normalized policy with empty AWS placeholders but no added privileges', () => {
  const normalized = { ...allowed, Statement: [{ ...allowed.Statement[0],
    Sid: '', NotPrincipal: {}, NotAction: [], NotResource: [], Condition: {} }] };
  assert.equal(validatedPublicFeedPolicy(JSON.stringify(normalized)), true);
  for (const invalid of [
    { ...normalized.Statement[0], NotAction: ['s3:DeleteObject'] },
    { ...normalized.Statement[0], NotResource: ['arn:aws:s3:::other/*'] },
    { ...normalized.Statement[0], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
  ]) assert.equal(validatedPublicFeedPolicy(JSON.stringify({ ...allowed, Statement: [invalid] })), false);
});
test('Feed verification requires correct public access block and no ACLs', () => {
  const policy = JSON.stringify(allowed);
  assert.equal(verifiedPublicFeedAccess(state, policy, false), true);
  assert.equal(verifiedPublicFeedAccess({ ...state, BlockPublicPolicy: true }, policy, false), false);
  assert.equal(verifiedPublicFeedAccess(state, policy, true), false);
  assert.equal(verifiedPublicFeedAccess(state, '{}', false), false);
});
