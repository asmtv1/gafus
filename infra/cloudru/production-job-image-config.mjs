/**
 * Desired immutable image references for the four active Cloud.ru Jobs.
 * Optional GitHub Secrets/Variables override checked-in release defaults.
 * Chat2 retains its existing pinned image unless explicitly overridden.
 */
import { CLOUDRU_PRODUCTION_JOBS, imageRepository } from './production-job-inventory.mjs';

export const RELEASE_DIGESTS = Object.freeze({
  'feed-worker':'81a3a80f1d8c7c3beec390c15ae860316d71585e9918b0cea68621a79217789f',
  'chat-video':'97f4e6e38c6ae9f289b56369fc203a631d7b691ae1ca681b4b1abd5e04b939c4',
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
