/**
 * Desired immutable image references for the four active Cloud.ru Jobs.
 * Optional GitHub Secrets/Variables override checked-in release defaults.
 * Chat2 retains its existing pinned image unless explicitly overridden.
 */
import { CLOUDRU_PRODUCTION_JOBS, imageRepository } from './production-job-inventory.mjs';

export const RELEASE_DIGESTS = Object.freeze({
  'feed-worker':'81a3a80f1d8c7c3beec390c15ae860316d71585e9918b0cea68621a79217789f',
  'chat-video':'ed9171f5d91c07642125aad4a740aa289d52188c53b864725e85c8f56f011fc6',
});
export const IMAGE_OVERRIDE_ENV = Object.freeze({
  'feed-worker':'CLOUDRU_FEED_WORKER_IMAGE',
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
