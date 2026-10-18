/**
 * Questions-only Cloud.ru S3 + Beget CDN provisioning. NEVER touches the
 * existing documents, gallery, feed buckets or current CDN resources.
 * Default is a side-effect-free plan. Requires explicit confirmation for writes.
 * This is an infrastructure readiness tool, NOT a production app cutover.
 */
import { randomUUID, createHash } from 'node:crypto';
import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand,
  GetBucketPolicyCommand, GetPublicAccessBlockCommand, PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export const QUESTIONS_BUCKET = 'gafus-questions-public';
export const QUESTIONS_ORIGIN = `https://${QUESTIONS_BUCKET}.s3.cloud.ru`;
const confirm = 'create-isolated-questions-public-storage';
const keyPrefix = 'questions/uploads/questions/';
const allowedModes = ['--plan', '--check-beget', '--create-bucket', '--smoke-bucket', '--create-cdn'];

export function questionBucketPolicy() {
  return {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'PublicReadOfPublishedQuestionPhotosOnly',
      Effect: 'Allow', Principal: '*', Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${QUESTIONS_BUCKET}/${keyPrefix}*`,
    }],
  };
}
function requireConfirmation() {
  if (process.env.GAFUS_QUESTIONS_INFRA_CONFIRM !== confirm)
    throw new Error('QUESTIONS_INFRA_CONFIRM_REQUIRED');
}
function client() {
  if (process.env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru' ||
      !process.env.CLOUDRU_S3_ACCESS_KEY_ID || !process.env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw new Error('QUESTIONS_S3_CREDENTIALS_MISSING');
  return new S3Client({
    endpoint: 'https://s3.cloud.ru', region: 'ru-central-1',
    // S3 API HeadBucket works with path-style on Cloud.ru; virtual host may return a false 404.
    forcePathStyle: true, maxAttempts: 1,
    credentials: {
      accessKeyId: process.env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    },
  });
}
async function requireExistingBucket(s3) {
  await s3.send(new HeadBucketCommand({ Bucket: QUESTIONS_BUCKET }),
    { abortSignal: AbortSignal.timeout(12000) });
}
export async function createBucket(s3) {
  try {
    await requireExistingBucket(s3);
    throw new Error('QUESTIONS_BUCKET_ALREADY_EXISTS_MANUAL_REVIEW_REQUIRED');
  } catch (error) {
    if (error.message === 'QUESTIONS_BUCKET_ALREADY_EXISTS_MANUAL_REVIEW_REQUIRED') throw error;
    if (error.$metadata?.httpStatusCode !== 404) throw error;
  }
  // Cloud.ru bucket domain/global name is set via the Cloud.ru console.
  // If this fails, do not re-run blindly; inspect HeadBucket and policy first.
  await s3.send(new CreateBucketCommand({ Bucket: QUESTIONS_BUCKET }),
    { abortSignal: AbortSignal.timeout(16000) });
  console.log('QUESTIONS_BUCKET_CREATED=YES');
  // Do not bypass an inherited Public Access Block. A service administrator
  // must review the new bucket policy before lifting any such restriction.
  try {
    const current = await s3.send(new GetPublicAccessBlockCommand({ Bucket: QUESTIONS_BUCKET }),
      { abortSignal: AbortSignal.timeout(9000) });
    if (current.PublicAccessBlockConfiguration?.BlockPublicPolicy ||
        current.PublicAccessBlockConfiguration?.RestrictPublicBuckets)
      throw new Error('QUESTIONS_PUBLIC_ACCESS_BLOCK_REQUIRES_REVIEW');
  } catch (error) {
    if (error.message === 'QUESTIONS_PUBLIC_ACCESS_BLOCK_REQUIRES_REVIEW') throw error;
    // NoSuchPublicAccessBlockConfiguration is valid. Other errors are not.
    if (error.name !== 'NoSuchPublicAccessBlockConfiguration') throw error;
  }
  await s3.send(new PutBucketPolicyCommand({
    Bucket: QUESTIONS_BUCKET, Policy: JSON.stringify(questionBucketPolicy()),
  }), { abortSignal: AbortSignal.timeout(12000) });
  console.log('QUESTIONS_PUBLIC_GET_ONLY_POLICY=APPLIED');
}
async function verifyExpectedPolicy(s3) {
  await requireExistingBucket(s3);
  const result = await s3.send(new GetBucketPolicyCommand({ Bucket: QUESTIONS_BUCKET }),
    { abortSignal: AbortSignal.timeout(12000) });
  // Never silently accept a broad existing public policy.
  const actual = JSON.parse(result.Policy ?? 'null');
  const statements = actual?.Statement;
  const expected = questionBucketPolicy().Statement[0];
  const st = Array.isArray(statements) && statements.length === 1 ? statements[0] : null;
  // Cloud.ru normalizes bucket policy JSON by adding empty NotAction, NotResource,
  // NotPrincipal and Condition fields. Reject any nonempty additional grants.
  if (!st || st.Sid !== expected.Sid || st.Effect !== expected.Effect ||
      st.Principal !== expected.Principal || st.Action !== expected.Action ||
      st.Resource !== expected.Resource ||
      (st.NotPrincipal && Object.keys(st.NotPrincipal).length) ||
      (st.NotAction && st.NotAction.length) ||
      (st.NotResource && st.NotResource.length) ||
      (st.Condition && Object.keys(st.Condition).length))
    throw new Error('QUESTIONS_UNEXPECTED_BUCKET_POLICY');
  return true;
}
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);
export async function smokeBucket(s3, fetcher = fetch) {
  await verifyExpectedPolicy(s3);
  const id = randomUUID();
  const key = `${keyPrefix}questions-smoke/${id}.png`;
  const writeKey = `${keyPrefix}questions-smoke/${randomUUID()}.png`;
  const base = `${QUESTIONS_ORIGIN}/${key}`;
  let uploadAttempted = false;
  let anonymousWriteAttempted = false;
  try {
    uploadAttempted = true;
    await s3.send(new PutObjectCommand({ Bucket: QUESTIONS_BUCKET, Key: key,
      Body: syntheticPng, ContentType: 'image/png', ContentLength: syntheticPng.length,
      CacheControl: 'public, max-age=180, must-revalidate', IfNoneMatch: '*',
    }), { abortSignal: AbortSignal.timeout(15000) });
    const response = await fetcher(base, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200 || !bytes.equals(syntheticPng))
      throw new Error(`QUESTIONS_ANONYMOUS_GET_FAILED_${response.status}`);
    const listing = await fetcher(`${QUESTIONS_ORIGIN}/?list-type=2`,
      { signal: AbortSignal.timeout(10000) });
    void listing.body?.cancel();
    if (listing.status >= 200 && listing.status < 300)
      throw new Error('QUESTIONS_ANONYMOUS_LIST_IS_PUBLIC');
    anonymousWriteAttempted = true;
    const write = await fetcher(`${QUESTIONS_ORIGIN}/${writeKey}`, {
      method: 'PUT', body: syntheticPng, headers: { 'Content-Type': 'image/png' },
      signal: AbortSignal.timeout(12000),
    });
    void write.body?.cancel();
    if (write.status >= 200 && write.status < 300)
      throw new Error('QUESTIONS_ANONYMOUS_WRITE_IS_PUBLIC');
    return { status: 'PASS', bucket: QUESTIONS_BUCKET,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      anonymousGet: 200, anonymousList: listing.status, anonymousPut: write.status };
  } finally {
    // Never leave disposable fixtures even if PUT returned an unknown result.
    if (uploadAttempted) await s3.send(new DeleteObjectCommand({ Bucket: QUESTIONS_BUCKET, Key: key }),
      { abortSignal: AbortSignal.timeout(15000) });
    if (anonymousWriteAttempted) await s3.send(new DeleteObjectCommand({ Bucket: QUESTIONS_BUCKET, Key: writeKey }),
      { abortSignal: AbortSignal.timeout(15000) });
  }
}
async function begetGet(path) {
  const token = process.env.BEGET_CDN_API_TOKEN;
  if (!token || token.length < 24) throw new Error('BEGET_CDN_TOKEN_MISSING');
  const response = await fetch(`https://api.beget.com${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`BEGET_API_HTTP_${response.status}`);
  return response.json();
}
export async function createCdn(s3) {
  // Never create a CDN pointing at an unverified / inaccessible S3 origin.
  const smoke = await smokeBucket(s3);
  if (smoke.status !== 'PASS') throw new Error('QUESTIONS_BUCKET_SMOKE_REQUIRED');
  const list = await begetGet('/v1/cloud');
  if (JSON.stringify(list).includes('GAFUS Questions CDN') ||
      JSON.stringify(list).includes(QUESTIONS_ORIGIN))
    throw new Error('QUESTIONS_CDN_MAY_ALREADY_EXIST_REVIEW_FIRST');
  const configs = await begetGet('/v1/cloud/configuration');
  if (!configs.configuration?.some(x => x.id === 'cdn_v1' && x.type === 'CDN'))
    throw new Error('QUESTIONS_BEGET_CDN_CONFIG_UNAVAILABLE');
  const token = process.env.BEGET_CDN_API_TOKEN;
  // Official Beget OpenAPI CloudCreateRequest / CdnCdnCreateParams shape.
  const response = await fetch('https://api.beget.com/v1/cloud', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ configuration_id: 'cdn_v1', display_name: 'GAFUS Questions CDN',
      cdn_params: { source_params: { domain: `${QUESTIONS_BUCKET}.s3.cloud.ru`,
        source_service_type: 'DOMAIN', source_protocol: 'HTTPS' } } }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.cdn_error || !body.service?.id)
    throw new Error(`QUESTIONS_CDN_CREATE_NOT_CONFIRMED_HTTP_${response.status}`);
  // No automatic app cutover: read-only CDN configuration and cache-purge
  // verification are mandatory after creation.
  console.log('QUESTIONS_CDN_CREATED_SERVICE_ID=' + body.service.id);
}
async function main() {
  const mode = process.argv[2] ?? '--plan';
  if (!allowedModes.includes(mode) || process.argv.length > 3)
    throw new Error('QUESTIONS_PROVISION_UNSUPPORTED_MODE');
  if (mode === '--plan') {
    console.log(JSON.stringify({ bucket: QUESTIONS_BUCKET, origin: QUESTIONS_ORIGIN,
      publicAccess: 's3:GetObject on questions/uploads/questions/* only',
      privateBuckets: 'untouched', begetSource: 'public Cloud.ru S3 virtual host',
      liveCutover: false, commands: allowedModes }, null, 2));
    return;
  }
  if (mode === '--check-beget') {
    const result = await begetGet('/v1/cloud/cdn/price');
    console.log('BEGET_CDN_API=PASS', 'priceFields=' + Object.keys(result).join(','));
    return;
  }
  requireConfirmation();
  const s3 = client();
  try {
    if (mode === '--create-bucket') await createBucket(s3);
    if (mode === '--smoke-bucket') console.log('QUESTIONS_BUCKET_SMOKE=' + JSON.stringify(await smokeBucket(s3)));
    if (mode === '--create-cdn') await createCdn(s3);
  } finally { s3.destroy(); }
}
if (process.argv[1]?.endsWith('questions-public-provision.mjs')) {
  main().catch(err => {
    console.error('QUESTIONS_INFRA_BLOCKED', err instanceof Error ? err.message : 'UnknownError');
    process.exitCode = 1;
  });
}
