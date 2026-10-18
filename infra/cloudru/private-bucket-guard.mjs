/** Gallery/documents stay private. In public-Feed mode verify narrowly scoped
 * final-object GET policy; never mutate the Feed policy or ACL from this guard.
 * --plan is read-only. --apply changes ONLY private buckets after confirmation.
 */
import { fileURLToPath } from 'node:url';
import { S3Client, GetBucketAclCommand, GetBucketPolicyCommand,
  GetPublicAccessBlockCommand, PutPublicAccessBlockCommand } from '@aws-sdk/client-s3';
const buckets = ['gafus-gallery-private', 'gafus-feed-private', 'gafus-documents-private'];
const protectedState = { BlockPublicAcls: true, IgnorePublicAcls: true,
  BlockPublicPolicy: true, RestrictPublicBuckets: true };
const publicFeedState = { BlockPublicAcls: true, IgnorePublicAcls: true,
  BlockPublicPolicy: false, RestrictPublicBuckets: false };
const feedResource = 'arn:aws:s3:::gafus-feed-private/posts/*/attachments/*';

/** Strict scope validation; unexpected extra public grants are never approved. */
export function validatedPublicFeedPolicy(raw) {
  let policy;
  try { policy = JSON.parse(raw); } catch { return false; }
  if (!policy || policy.Version !== '2012-10-17') return false;
  const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
  return statements.length === 1 && statements.every(statement => {
    const principal = statement?.Principal;
    const action = statement?.Action;
    const resource = statement?.Resource;
    return statement?.Effect === 'Allow' &&
      (principal === '*' || (principal && typeof principal === 'object' &&
        !Array.isArray(principal) && Object.keys(principal).length === 1 && principal.AWS === '*')) &&
      (action === 's3:GetObject' ||
        (Array.isArray(action) && action.length === 1 && action[0] === 's3:GetObject')) &&
      (resource === feedResource ||
        (Array.isArray(resource) && resource.length === 1 && resource[0] === feedResource)) &&
      Object.keys(statement).every(key => ['Sid', 'Effect', 'Principal', 'Action', 'Resource',
        'NotPrincipal', 'NotAction', 'NotResource', 'Condition'].includes(key)) &&
      (statement.Sid === undefined || typeof statement.Sid === 'string') &&
      (statement.NotPrincipal === undefined ||
        (statement.NotPrincipal && !Array.isArray(statement.NotPrincipal) &&
          typeof statement.NotPrincipal === 'object' && !Object.keys(statement.NotPrincipal).length)) &&
      (statement.NotAction === undefined ||
        (Array.isArray(statement.NotAction) && statement.NotAction.length === 0)) &&
      (statement.NotResource === undefined ||
        (Array.isArray(statement.NotResource) && statement.NotResource.length === 0)) &&
      (statement.Condition === undefined ||
        (statement.Condition && !Array.isArray(statement.Condition) &&
          typeof statement.Condition === 'object' && !Object.keys(statement.Condition).length));
  });
}
export function verifiedPublicFeedAccess(block, policyText, hasPublicAcl) {
  return hasPublicAcl === false && !!block &&
    Object.entries(publicFeedState).every(([key, value]) => block[key] === value) &&
    validatedPublicFeedPolicy(policyText);
}
const isMissing = (error, name) => error?.$metadata?.httpStatusCode === 404 && error.name === name;
async function main() {
  const mode = process.argv[2] ?? '--plan';
  if (!['--plan', '--apply'].includes(mode)) throw Error('INVALID_MODE');
  if (process.env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru') throw Error('INVALID_ENDPOINT');
  if (!process.env.CLOUDRU_S3_ACCESS_KEY_ID || !process.env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw Error('CREDENTIALS_MISSING');
  if (mode === '--apply' && process.env.CLOUDRU_PRIVACY_GUARD_CONFIRM !== 'three-private-buckets')
    throw Error('APPLY_NOT_AUTHORIZED');
  if (process.env.FEED_BUCKET_PUBLIC !== undefined && !['true', 'false'].includes(process.env.FEED_BUCKET_PUBLIC))
    throw Error('INVALID_FEED_FLAG');
  const publicFeed = process.env.FEED_BUCKET_PUBLIC === 'true';
  const client = new S3Client({ endpoint: 'https://s3.cloud.ru', region: 'ru-central-1',
    forcePathStyle: true, maxAttempts: 1, credentials: {
      accessKeyId: process.env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    } });
  const decisions = [];
  try {
    for (const bucket of buckets) {
      const acl = await client.send(new GetBucketAclCommand({ Bucket: bucket }));
      const hasPublicAcl = (acl.Grants ?? []).some(g => /AllUsers|AuthenticatedUsers/.test(g.Grantee?.URI ?? ''));
      if (hasPublicAcl) throw Error(`PUBLIC_ACL_${bucket}`);
      let policy = null;
      try { policy = (await client.send(new GetBucketPolicyCommand({ Bucket: bucket }))).Policy ?? ''; }
      catch (error) { if (!isMissing(error, 'NoSuchBucketPolicy')) throw error; }
      let current = null;
      try { current = (await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }))).PublicAccessBlockConfiguration ?? null; }
      catch (error) { if (!isMissing(error, 'NoSuchPublicAccessBlockConfiguration')) throw error; }
      if (bucket === 'gafus-feed-private' && publicFeed) {
        if (!verifiedPublicFeedAccess(current, policy, hasPublicAcl))
          throw Error('PUBLIC_FEED_SCOPE_NOT_VERIFIED');
        decisions.push({ bucket, publicFinalReadVerified: true, requiresUpdate: false });
        continue;
      }
      if (policy !== null) throw Error(`EXISTING_POLICY_REQUIRES_REVIEW_${bucket}`);
      const compliant = current && Object.entries(protectedState).every(([key, value]) => current[key] === value);
      decisions.push({ bucket, alreadyProtected: !!compliant, requiresUpdate: !compliant });
    }
    if (mode === '--apply') {
      for (const decision of decisions) {
        if (decision.publicFinalReadVerified) {
          console.log(JSON.stringify({ bucket: decision.bucket, publicFinalReadVerified: true, changed: false }));
          continue;
        }
        if (decision.requiresUpdate) await client.send(new PutPublicAccessBlockCommand({
          Bucket: decision.bucket, PublicAccessBlockConfiguration: protectedState,
        }));
        const verified = (await client.send(new GetPublicAccessBlockCommand({ Bucket: decision.bucket }))).PublicAccessBlockConfiguration ?? {};
        if (!Object.entries(protectedState).every(([key, value]) => verified[key] === value))
          throw Error(`PRIVATE_GUARD_VERIFY_FAILED_${decision.bucket}`);
        console.log(JSON.stringify({ bucket: decision.bucket, allPublicAccessBlocked: true, changed: decision.requiresUpdate }));
      }
    } else for (const decision of decisions) console.log(JSON.stringify({ mode: 'plan', ...decision }));
  } finally { client.destroy(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
