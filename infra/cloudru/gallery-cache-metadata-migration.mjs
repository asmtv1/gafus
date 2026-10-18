/** In-place metadata rewrite for finalized PRIVATE Gallery WebP. No new bucket,
 * no download/reupload, no originals, no incoming/attempts. Default dry run.
 * IMPORTANT: This does not execute from CI; an operator must explicitly approve.
 */
import { pathToFileURL } from 'node:url';
import { S3Client, ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

const id = '[A-Za-z0-9_-]{1,128}';
const photo = new RegExp(`^albums/${id}/${id}/photos/${id}/(thumb|full)\\.webp$`);
const vet = new RegExp(`^users/${id}/pets/${id}/vet-visits/${id}/${id}/thumb\\.webp$`);
export function isGalleryCacheableFinal(key) {
  return typeof key === 'string' && key.length < 900 && (photo.test(key) || vet.test(key));
}
export function needsGalleryMetadataUpdate(key, meta) {
  return isGalleryCacheableFinal(key) && meta?.ContentType === 'image/webp' &&
    Number.isSafeInteger(meta.ContentLength) && meta.ContentLength > 0 &&
    meta.ContentLength <= 10 * 1024 * 1024 &&
    /^"?[a-f0-9]{32}"?$/i.test(meta.ETag ?? '') &&
    meta.CacheControl !== 'public, max-age=180, s-maxage=600, must-revalidate';
}
export async function migrateGalleryMetadata(client, { apply = false, limit = 10000, confirm = '' } = {}) {
  const bucket = 'gafus-gallery-private';
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000) throw Error('BAD_GALLERY_MIGRATION_LIMIT');
  if (apply && confirm !== 'approve-gallery-final-metadata-only-20261018')
    throw Error('GALLERY_METADATA_APPLY_REQUIRES_APPROVAL');
  const counters = { scanned: 0, finals: 0, pending: 0, changed: 0, alreadyCacheable: 0, rejected: 0 };
  for (const prefix of ['albums/', 'users/']) {
    let continuation;
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: prefix, MaxKeys: 200, ContinuationToken: continuation,
      }), { abortSignal: AbortSignal.timeout(12000) });
      for (const entry of response.Contents ?? []) {
        counters.scanned++;
        if (counters.scanned > limit) throw Error('GALLERY_METADATA_LIMIT_REACHED');
        if (!isGalleryCacheableFinal(entry.Key)) continue;
        counters.finals++;
        const key = entry.Key;
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(10000) });
        if (head.CacheControl === 'public, max-age=180, s-maxage=600, must-revalidate') { counters.alreadyCacheable++; continue; }
        if (!needsGalleryMetadataUpdate(key, head)) { counters.rejected++; continue; }
        counters.pending++;
        if (!apply) continue;
        const source = `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
        await client.send(new CopyObjectCommand({
          Bucket: bucket, Key: key, CopySource: source,
          CopySourceIfMatch: head.ETag,
          MetadataDirective: 'REPLACE', TaggingDirective: 'COPY',
          ContentType: head.ContentType, CacheControl: 'public, max-age=180, s-maxage=600, must-revalidate',
          Metadata: head.Metadata,
          ContentDisposition: head.ContentDisposition,
          ContentEncoding: head.ContentEncoding,
          ContentLanguage: head.ContentLanguage,
          Expires: head.Expires,
        }), { abortSignal: AbortSignal.timeout(16000) });
        const after = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(10000) });
        if (after.ContentLength !== head.ContentLength || after.ContentType !== 'image/webp' ||
            after.CacheControl !== 'public, max-age=180, s-maxage=600, must-revalidate' || after.ETag !== head.ETag)
          throw Error('GALLERY_METADATA_POSTCHECK_FAILED');
        counters.changed++;
      }
      continuation = response.IsTruncated ? response.NextContinuationToken : undefined;
      if (response.IsTruncated && !continuation) throw Error('GALLERY_METADATA_PAGINATION_BROKEN');
    } while (continuation);
  }
  if (counters.rejected) throw Error(`GALLERY_METADATA_REQUIRES_REVIEW_${counters.rejected}`);
  return counters;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] ?? '--plan';
  if (!['--plan', '--apply'].includes(action)) throw Error('BAD_GALLERY_MIGRATION_ACTION');
  if (process.env.GALLERY_BUCKET !== 'gafus-gallery-private' ||
      process.env.GALLERY_S3_ENDPOINT !== 'https://s3.cloud.ru' ||
      process.env.GALLERY_BUCKET_PUBLIC === 'true') throw Error('PRIVATE_BUCKET_ONLY');
  const apply = action === '--apply';
  if (apply && process.env.GALLERY_METADATA_APPLY_CONFIRM !== 'approve-gallery-final-metadata-only-20261018')
    throw Error('GALLERY_METADATA_PROD_WRITE_NOT_APPROVED');
  const client = new S3Client({ endpoint: 'https://s3.cloud.ru', region: 'ru-central-1',
    forcePathStyle: true, maxAttempts: 1, credentials: {
      accessKeyId: process.env.GALLERY_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.GALLERY_S3_SECRET_ACCESS_KEY ?? '',
    } });
  try {
    console.log(JSON.stringify({ action, ...(await migrateGalleryMetadata(client, {
      apply, confirm: process.env.GALLERY_METADATA_APPLY_CONFIRM,
      limit: Number(process.env.GALLERY_METADATA_MAX_SCAN ?? '10000'),
    })) }));
  } finally { client.destroy(); }
}
