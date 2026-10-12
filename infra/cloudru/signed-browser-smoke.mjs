/**
 * Live Cloud.ru signed POST/GET and private ACL smoke. Only disposable random UUID
 * keys under a reserved test prefix are ever written/deleted. Never list or
 * modify user keys. Does not enable CORS or alter bucket permissions.
 */
import { randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function runSignedBrowserSmoke(env = process.env) {
  if (env.CLOUDRU_BROWSER_SMOKE_CONFIRM !== 'disposable-uuid-only' ||
      env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru' ||
      !env.CLOUDRU_S3_ACCESS_KEY_ID || !env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw new Error('CLOUDRU_BROWSER_SMOKE_NOT_AUTHORIZED');
  const buckets = ['gafus-gallery-private', 'gafus-feed-private', 'gafus-documents-private'];
  const client = new S3Client({ endpoint: 'https://s3.cloud.ru', region: 'ru-central-1',
    forcePathStyle: true, maxAttempts: 1,
    credentials: { accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY } });
  const origin = env.CLOUDRU_BROWSER_TEST_ORIGIN ?? 'https://gafus.ru';
  if (!['https://gafus.ru', 'https://www.gafus.ru'].includes(origin))
    throw new Error('CLOUDRU_BROWSER_SMOKE_UNEXPECTED_ORIGIN');
  const output = [];
  try {
    for (const bucket of buckets) {
      const key = `__gafus_cloudru_validation__/signed-browser-${randomUUID()}.txt`;
      const bytes = Buffer.from(`gafus-signed-browser-${randomUUID()}`);
      const info = { bucket, upload: 'not-run', uploadStatus: null, presignedGet: false,
        anonymousGetDenied: false, removed: false, cors: {}, signedGetCors: {} };
      let created = false;
      try {
        for (const origin of ['https://gafus.ru', 'https://www.gafus.ru']) {
          const method = bucket === 'gafus-documents-private' ? 'GET' : 'POST';
          const response = await fetch(`https://s3.cloud.ru/${bucket}/${key}`, {
            method: 'OPTIONS', headers: { Origin: origin,
              'Access-Control-Request-Method': method,
              'Access-Control-Request-Headers': method === 'POST' ? 'content-type,x-amz-date' : 'accept' },
            signal: AbortSignal.timeout(8000), redirect: 'manual',
          });
          const allowed = (response.headers.get('access-control-allow-methods') ?? '')
            .split(',').some(value => value.trim().toUpperCase() === method);
          info.cors[origin] = response.status >= 200 && response.status < 300 &&
            response.headers.get('access-control-allow-origin') === origin && allowed;
        }
        if (bucket !== 'gafus-documents-private') {
          const form = await createPresignedPost(client, { Bucket: bucket, Key: key,
            Expires: 90,
            Fields: { 'Content-Type': 'text/plain', success_action_status: '204' },
            Conditions: [['content-length-range', 1, 512], ['eq', '$Content-Type', 'text/plain'],
              ['eq', '$key', key], ['eq', '$success_action_status', '204']],
          });
          const body = new FormData();
          for (const [name, value] of Object.entries(form.fields)) body.append(name, value);
          body.append('file', new Blob([bytes], { type: 'text/plain' }), 'test.txt');
          const response = await fetch(form.url, { method: 'POST', body,
            headers: { Origin: origin },
            redirect: 'manual', signal: AbortSignal.timeout(15000) });
          info.signedPostCors = response.headers.get('access-control-allow-origin');
          info.uploadStatus = response.status;
          created = response.status >= 200 && response.status < 300;
          info.upload = created ? 'signed-post-pass' : 'signed-post-failed';
        } else {
          await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
            ContentType: 'text/plain', CacheControl: 'private, no-store', IfNoneMatch: '*' }),
          { abortSignal: AbortSignal.timeout(15000) });
          created = true;
          info.upload = 'server-put-pass';
        }
        if (created) {
          const get = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 90 });
          const signed = await fetch(get, { signal: AbortSignal.timeout(10000), redirect: 'manual',
            headers: { Origin: origin } });
          info.signedGetCors[origin] = signed.headers.get('access-control-allow-origin');
          info.presignedGet = signed.ok && Buffer.from(await signed.arrayBuffer()).equals(bytes);
          // A signed URL is not permission to read cross-origin from arbitrary sites.
          const stranger = await fetch(get, { signal: AbortSignal.timeout(10000),
            redirect: 'manual', headers: { Origin: 'https://untrusted.example' } });
          info.untrustedOriginRejectedByCors =
            stranger.headers.get('access-control-allow-origin') !== 'https://untrusted.example';
          const anon = await fetch(`https://s3.cloud.ru/${bucket}/${key}`, {
            method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000) });
          info.anonymousStatus = anon.status;
          const anonymousBody = Buffer.from(await anon.arrayBuffer());
          info.anonymousBytesMatch = anon.ok && anonymousBody.equals(bytes);
          const code = anonymousBody.toString('utf8').match(/<Code>([A-Za-z0-9]+)<\/Code>/);
          info.anonymousErrorCode = code?.[1] ?? null;
          info.anonymousGetDenied = [400, 401, 403, 404].includes(anon.status) && !info.anonymousBytesMatch;
        }
      } catch (error) {
        info.failedStep = error?.name?.slice(0, 60) ?? 'unknown';
      } finally {
        // UUID + reserved prefix: DELETE is safe even if POST committed on timeout.
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }),
            { abortSignal: AbortSignal.timeout(10000) }).catch(() => null);
          if (head) {
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }),
              { abortSignal: AbortSignal.timeout(10000) });
            const after = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }),
              { abortSignal: AbortSignal.timeout(10000) }).catch(e => e);
            info.removed = after?.$metadata?.httpStatusCode === 404;
          } else info.removed = true;
        } catch { info.cleanupFailed = true; }
      }
      output.push(info);
    }
  } finally { client.destroy(); }
  return output;
}
if (process.argv[1]?.endsWith('/signed-browser-smoke.mjs')) {
  const rows = await runSignedBrowserSmoke();
  for (const row of rows) console.log(JSON.stringify(row));
  if (rows.some(row => row.upload.includes('failed') || !row.presignedGet ||
      row.signedGetCors[process.env.CLOUDRU_BROWSER_TEST_ORIGIN ?? 'https://gafus.ru'] !==
        (process.env.CLOUDRU_BROWSER_TEST_ORIGIN ?? 'https://gafus.ru') ||
      (row.bucket !== 'gafus-documents-private' &&
        row.signedPostCors !== (process.env.CLOUDRU_BROWSER_TEST_ORIGIN ?? 'https://gafus.ru')) ||
      !row.untrustedOriginRejectedByCors ||
      !row.anonymousGetDenied || !row.removed))
    process.exitCode = 1;
  // OPTIONS can be denied by this provider even when browser-simple signed
  // multipart POST and signed GET return correct CORS headers. Keep recording
  // it, but do not misclassify these actual browser transports as broken.
  if (rows.some(row => Object.values(row.cors).some(value => !value)))
    console.log('PREFLIGHT_403_ON_SYNTHETIC_OPTIONS: requires separate browser acceptance');
}
