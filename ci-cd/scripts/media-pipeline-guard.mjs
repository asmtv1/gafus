/**
 * Pure, source-only release gate for the new GAFUS media architecture:
 * - Photos are client WebP + API/S3 confirmation, not Cloud photo Jobs.
 * - Feed 720p+poster are client-encoded and S3-verified; Cloud produces ONLY 360p.
 * - Chat2 720p+poster are client-encoded; Cloud launches ONLY background 360p Jobs.
 * - No Gallery Container Jobs. Storage cleanup must be available without photo jobs.
 *
 * Fail closed before attempting any Cloud.ru registry login, Job reconciliation
 * or production deployment. This file intentionally has no write/network API.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';
import { CLOUDRU_PRODUCTION_JOBS, CLOUDRU_JOB_IMAGES } from '../../infra/cloudru/production-job-inventory.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const yaml=p=>YAML.parse(read(p),{uniqueKeys:true});
export const activeImages=Object.freeze([
  {media:'feed',role:'worker',dockerfile:'Dockerfile'},
  {media:'chat',role:'video',dockerfile:'Dockerfile.chat2-job'},
]);
export const activeJobs=Object.freeze([
  'gafus-feed-video','gafus-feed-video-2',
  'gafus-chat-video','gafus-chat-video-2',
]);
export function checkMediaPipeline({images,jobs,selectors,jobRelease,manualRelease,
  feedWorker,feedService,chatJobEntry,chatProcessor,feedCloudServer,
  galleryWorker,questionsWorker,workerCron,chatClientVideoFinalize}) {
  const errors=[];
  const add=(ok,why)=>{if(!ok)errors.push(why);};
  const triplet=x=>`${x.media}:${x.role}:${x.dockerfile}`;
  const wanted=activeImages.map(triplet).sort();
  const actual=images?.jobs?.build?.strategy?.matrix?.include?.map(triplet)?.sort();
  add(JSON.stringify(actual)===JSON.stringify(wanted),'CLOUDRU_MEDIA_IMAGE_MATRIX_NOT_TWO_VIDEO_ROLES');
  add(images?.jobs?.build?.needs==='verify-media-contracts','CLOUDRU_MEDIA_BUILD_MUST_WAIT_FOR_CONTRACTS');
  add(images?.jobs?.build?.steps?.some(x=>x.run?.includes('publish-cloudru-image.sh')),
    'CLOUDRU_MEDIA_PUBLISH_SELECTOR_MISSING');
  add(images?.jobs?.['verify-media-contracts']?.steps?.some(x=>
    x.run?.includes('media-pipeline-guard.mjs')),
    'CLOUDRU_MEDIA_PUBLISH_MUST_PRECHECK_SOURCE_CONTRACT');
  add(images?.jobs?.build?.steps?.some(x=>x.with?.file?.includes("matrix.media == 'questions'"))===false,
    'CLOUDRU_MEDIA_RETIRED_QUESTIONS_DOCKERFILE_BRANCH');
  const names=(jobs??[]).map(j=>j.name).sort();
  add(JSON.stringify(names)===JSON.stringify([...activeJobs].sort()),'CLOUDRU_ONLY_FOUR_VIDEO_JOBS_ALLOWED');
  add(Object.keys(CLOUDRU_JOB_IMAGES).sort().join(',')===
    ['chat-video','feed-worker'].sort().join(','),'CLOUDRU_JOB_IMAGE_ROLES_UNSAFE');
  add(selectors?.includes('feed:worker:Dockerfile|chat:video:Dockerfile.chat2-job'),
    'CLOUDRU_PUBLISH_ALLOWLIST_INCOMPLETE');
  add(!/\b(?:questions:photo|chat:photo|feed:photo|gallery:photo|gallery:worker):/.test(selectors??''),
    'CLOUDRU_PUBLISH_HAS_RETIRED_PHOTO_SELECTOR');
  for(const [name,wf] of [['reusable',jobRelease],['manual',manualRelease]]) {
    add(!/CLOUDRU_(?:QUESTIONS_WORKER_IMAGE|CHAT_PHOTO_IMAGE)/.test(wf??''),
      `CLOUDRU_${name.toUpperCase()}_RETIRED_IMAGE_SECRET_REAPPEARED`);
    add(!/existing 11 Jobs|all 11 Cloud.ru Jobs|Reconcile existing 11/.test(wf??''),
      `CLOUDRU_${name.toUpperCase()}_RETIRED_11_JOB_RUNBOOK`);
  }
  add(feedWorker?.includes('reuseClient720IfValid: false') &&
    feedWorker.includes('mp4Keys.length !== 1') &&
    feedWorker.includes('processFeedV2Video)(source, dir,') &&
    feedWorker.includes('signal }), [360],') &&
    feedWorker.includes('skipPoster: true') &&
    !feedWorker.includes('posterKey = prefix') &&
    !feedWorker.includes('create(posterKey') &&
    !feedWorker.includes('background360 ? [360] : [360, 720]'),
    'FEED_CLOUD_MUST_ONLY_ENCODE_360_NEVER_720_OR_POSTER');
  add(feedService?.includes('feed-client-video-final-guard') &&
    feedService.includes('feed-video-360:'),
    'FEED_CLIENT_FIRST_720_PUBLISH_AND_OPTIONAL_360_REQUIRED');
  add(chatJobEntry?.includes('env.CHAT2_JOB_KIND!=="video"'),
    'CHAT_CLOUD_JOB_MUST_BE_VIDEO_ONLY');
  add(chatProcessor?.includes('job.phase !== "background_360"') &&
    chatProcessor.includes('source.kind !== "video"') &&
    !chatProcessor.includes('processFeedV2Image') &&
    chatProcessor.includes('reuseClient720IfValid: false') &&
    chatProcessor.includes('skipPoster: true') &&
    chatProcessor.includes('    [360],') &&
    !chatProcessor.includes('deps.objects.create(keys.video.poster') &&
    !chatProcessor.includes('posterKey: keys.video.poster'),
    'CHAT_CLOUD_MUST_ONLY_ENCODE_360_NEVER_720_OR_POSTER');
  add(feedCloudServer?.includes('workerType !== "video"') &&
    !feedCloudServer.includes('core.maintenance(20)') &&
    !feedWorker?.includes('input.objects.delete(') &&
    workerCron?.includes('runFeedLocalMaintenanceTick'),
    'FEED_CLOUD_JOB_MUST_ONLY_RUN_360_LOCAL_WORKER_OWNS_CLEANUP');
  add(feedService?.includes('const posterKey = `media/v2/${row.mediaId}/v1/poster.webp`') &&
    feedService.includes('storage.head(finalKey),storage.head(posterKey)') &&
    chatClientVideoFinalize?.includes('posterKey:prepared.posterKey'),
    'CLIENT_720_AND_CLIENT_POSTER_MUST_BE_VERIFIED_BEFORE_READY');
  add(galleryWorker?.includes('createGalleryLocalMaintenanceTick') &&
    galleryWorker.includes('input.objects.delete(key,signal.signal)') &&
    galleryWorker.includes('input.objects.create(job.targetKeys[i]!'),
    'GALLERY_WORKER_S3_MOVE_DELETE_MISSING');
  add(questionsWorker?.includes('createQuestionsPhotoRecoveryTick') &&
    questionsWorker.includes('cleanup:questionsPhotoCleanupInternal') &&
    workerCron?.includes('runQuestionsPhotoRecoveryTick') &&
    workerCron.includes('runGalleryLocalMaintenanceTick'),
    'QUESTIONS_OR_GALLERY_WORKER_STORAGE_MAINTENANCE_MISSING');
  return errors;
}
export function verifyCurrentMediaPipeline() {
  return checkMediaPipeline({
    images:yaml('.github/workflows/cloudru-media-images.yml'),
    jobs:CLOUDRU_PRODUCTION_JOBS,
    selectors:read('ci-cd/scripts/publish-cloudru-image.sh'),
    jobRelease:read('.github/workflows/production-job-release-reusable.yml'),
    manualRelease:read('.github/workflows/infrastructure-jobs.yml'),
    feedWorker:read('apps/feed-cloud/src/worker.ts'),
    feedService:read('packages/core/src/services/feed/service.ts'),
    chatJobEntry:read('apps/feed-cloud/src/chat2-job-entry.ts'),
    chatProcessor:read('apps/feed-cloud/src/chat2-v2-processor.ts'),
    feedCloudServer:read('apps/feed-cloud/src/server.ts'),
    chatClientVideoFinalize:read('apps/api/src/modules/chat2/media-v2-upload.ts'),
    galleryWorker:read('packages/worker/src/gallery-local-maintenance.ts'),
    questionsWorker:read('packages/worker/src/questions-photo-recovery.ts'),
    workerCron:read('packages/worker/src/cron-scheduler.ts'),
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const errors=verifyCurrentMediaPipeline();
  if(errors.length) {
    for(const e of errors)console.error('MEDIA_PIPELINE_RELEASE_BLOCKED:'+e);
    process.exitCode=1;
  }else console.log('MEDIA_PIPELINE_RELEASE_CONTRACT_PASS 2_images_4_jobs_client_webp_720_poster_cloud_only_360');
}
