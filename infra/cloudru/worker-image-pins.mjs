/** Immutable Cloud.ru worker image pins. Each worker has an independent source fingerprint.
 * A web/API-only push must reuse the already vetted image; changing any copied
 * worker source requires an explicit manual image publication and new pin.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const workerSources = Object.freeze({
  gallery: ['apps/gallery-cloud/Dockerfile', 'apps/gallery-cloud/src',
    'packages/gallery-storage/src', 'packages/core/src/services/gallery'],
  feed: ['apps/feed-cloud/Dockerfile', 'apps/feed-cloud/src',
    'packages/feed-cloud/src', 'packages/feed-storage/src'],
  questions: ['apps/questions-cloud/Dockerfile', 'apps/questions-cloud/src'],
});

export function workerSourceFingerprint(media, git = (path) => execFileSync('git', ['rev-parse', `HEAD:${path}`], {
  encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'],
}).trim()) {
  const paths = workerSources[media];
  if (!paths) throw Error('UNRECOGNIZED_CLOUDRU_WORKER_' + media);
  const h = createHash('sha256');
  for (const path of paths) {
    const object = git(path);
    if (!/^[a-f0-9]{40}$/.test(object)) throw Error('INVALID_WORKER_GIT_TREE_' + media);
    h.update(path + '\0' + object + '\n');
  }
  return h.digest('hex');
}

export function pinnedWorkerImage(media, env = process.env, fingerprint = workerSourceFingerprint) {
  if (!workerSources[media]) throw Error('UNRECOGNIZED_CLOUDRU_WORKER_' + media);
  const prefix = `CLOUDRU_${media.toUpperCase()}_WORKER`;
  const pinned = env[`${prefix}_IMAGE`] ?? '';
  const source = env[`${prefix}_SOURCE`] ?? '';
  if (!pinned || !source) throw Error('CLOUDRU_WORKER_PIN_MISSING_' + media);
  const expected = new RegExp(`^gafus\\.cr\\.cloud\\.ru/gafus-${media}-worker@sha256:[a-f0-9]{64}$`);
  if (!expected.test(pinned)) throw Error('CLOUDRU_WORKER_PIN_INVALID_' + media);
  if (!/^[a-f0-9]{64}$/.test(source) || source !== fingerprint(media))
    throw Error('CLOUDRU_WORKER_SOURCE_CHANGED_' + media);
  return pinned;
}

export function workerImages(env = process.env, fingerprint = workerSourceFingerprint) {
  return Object.fromEntries(Object.keys(workerSources).map(media =>
    [media + '-worker', pinnedWorkerImage(media, env, fingerprint)]));
}

if (process.argv[1]?.endsWith('/worker-image-pins.mjs')) {
  if (process.argv.length === 4 && process.argv[2] === '--source') {
    console.log(workerSourceFingerprint(process.argv[3]));
  } else if (process.argv.length === 3 && process.argv[2] === '--check') {
    for (const [role, image] of Object.entries(workerImages()))
      console.log('PIN_VALID', role, image);
  } else {
    console.error('Usage: node infra/cloudru/worker-image-pins.mjs --check | --source <gallery|feed|questions>');
    process.exitCode = 2;
  }
}
