/**
 * Desired immutable image references for the existing 11 Cloud.ru Jobs.
 * Optional GitHub Secrets/Variables override checked-in release defaults.
 * Chat2 retains its existing pinned image unless explicitly overridden.
 */
import { CLOUDRU_PRODUCTION_JOBS, imageRepository } from './production-job-inventory.mjs';

export const RELEASE_DIGESTS = Object.freeze({
  'gallery-worker':'7f8d4325a712b3ba0a78b1d6750e4325cd66b07f5157a0d6e0bcb751b4f6693c',
  'feed-worker':'cbf25f7f60e8f33ff261c6eeeab39f3f89412fc561340cc7f10ad903b5e16a02',
  'questions-photo':'96f76942f9f12099353b131c61332502175f18a1ec94919bfcfd1f4cc04ab321',
});
export const IMAGE_OVERRIDE_ENV = Object.freeze({
  'gallery-worker':'CLOUDRU_GALLERY_WORKER_IMAGE',
  'feed-worker':'CLOUDRU_FEED_WORKER_IMAGE',
  'questions-photo':'CLOUDRU_QUESTIONS_WORKER_IMAGE',
  'chat-photo':'CLOUDRU_CHAT_PHOTO_IMAGE',
  'chat-video':'CLOUDRU_CHAT_VIDEO_IMAGE',
});

const digest = /^sha256:[a-f0-9]{64}$/;
export function configuredImage(job, env = {}) {
  const repo = imageRepository(job);
  const key = IMAGE_OVERRIDE_ENV[job.imageRole];
  if (!key) throw Error('UNKNOWN_CLOUDRU_IMAGE_ROLE_' + job.imageRole);
  const raw = env[key];
  if (env.CLOUDRU_WORKER_PINS_REQUIRED === 'true' && RELEASE_DIGESTS[job.imageRole] && !raw)
    throw Error('REQUIRED_CLOUDRU_IMAGE_PIN_MISSING_' + key);
  if (raw !== undefined && raw !== null && raw !== '') {
    const value = raw.trim();
    const normalized = value.startsWith('sha256:') ? repo+'@'+value : value;
    if (!normalized.startsWith(repo+'@') || !digest.test(normalized.slice(repo.length+1)))
      throw Error('INVALID_CLOUDRU_IMAGE_OVERRIDE_' + key);
    return normalized;
  }
  return RELEASE_DIGESTS[job.imageRole] ? repo+'@sha256:'+RELEASE_DIGESTS[job.imageRole] : null;
}
export function imagePlan(env = {}, jobs = CLOUDRU_PRODUCTION_JOBS) {
  return jobs.map(job => ({job, targetImage: configuredImage(job, env)}));
}
