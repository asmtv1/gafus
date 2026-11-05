import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyCurrentMediaPipeline,activeImages,activeJobs,checkMediaPipeline} from './media-pipeline-guard.mjs';
import {CLOUDRU_PRODUCTION_JOBS} from '../../infra/cloudru/production-job-inventory.mjs';
import {readFileSync} from 'node:fs';
import YAML from 'yaml';
const read=p=>readFileSync(p,'utf8');
const baseline={
  images:YAML.parse(read('.github/workflows/cloudru-media-images.yml')),
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
};
test('real repo publish and release pipeline uses exactly two video images and four video Jobs',()=>{
  assert.deepEqual(verifyCurrentMediaPipeline(),[]);
  assert.equal(activeImages.length,2);
  assert.equal(activeJobs.length,4);
});
test('adding back Cloud photo build or an obsolete Job fails closed',()=>{
  const images=structuredClone(baseline.images);
  images.jobs.build.strategy.matrix.include.push({media:'chat',role:'photo',dockerfile:'Dockerfile.chat2-job'});
  assert(checkMediaPipeline({...baseline,images}).includes('CLOUDRU_MEDIA_IMAGE_MATRIX_NOT_TWO_VIDEO_ROLES'));
  const jobs=[...baseline.jobs,{name:'gafus-questions-photo',imageRole:'feed-worker'}];
  assert(checkMediaPipeline({...baseline,jobs}).includes('CLOUDRU_ONLY_FOUR_VIDEO_JOBS_ALLOWED'));
});
test('re-adding obsolete photo secrets and publish selectors is blocked before release',()=>{
  assert(checkMediaPipeline({...baseline,jobRelease:baseline.jobRelease+'\nCLOUDRU_CHAT_PHOTO_IMAGE=wrong'})
    .includes('CLOUDRU_REUSABLE_RETIRED_IMAGE_SECRET_REAPPEARED'));
  assert(checkMediaPipeline({...baseline,selectors:baseline.selectors+'\nquestions:photo:Dockerfile.questions-photo'})
    .includes('CLOUDRU_PUBLISH_HAS_RETIRED_PHOTO_SELECTOR'));
});
test('reintroducing server-side 720p or poster creation blocks the media release',()=>{
  assert(checkMediaPipeline({...baseline,feedWorker:baseline.feedWorker.replace('skipPoster: true','skipPoster: false')})
    .includes('FEED_CLOUD_MUST_ONLY_ENCODE_360_NEVER_720_OR_POSTER'));
  assert(checkMediaPipeline({...baseline,chatJobEntry:baseline.chatJobEntry.replace('env.CHAT2_JOB_KIND!=="video"','env.CHAT2_JOB_KIND!=="image"')})
    .includes('CHAT_CLOUD_JOB_MUST_BE_VIDEO_ONLY'));
  assert(checkMediaPipeline({...baseline,chatProcessor:baseline.chatProcessor.replace('skipPoster: true','skipPoster: false')})
    .includes('CHAT_CLOUD_MUST_ONLY_ENCODE_360_NEVER_720_OR_POSTER'));
  assert(checkMediaPipeline({...baseline,chatProcessor:baseline.chatProcessor.replace('    [360],','    [360, 720],')})
    .includes('CHAT_CLOUD_MUST_ONLY_ENCODE_360_NEVER_720_OR_POSTER'));
});

test('release refuses missing client poster verification or loss of existing Worker cleanup',()=>{
  assert(checkMediaPipeline({...baseline,
    chatClientVideoFinalize:baseline.chatClientVideoFinalize.replace('posterKey:prepared.posterKey','posterKey:undefined')})
    .includes('CLIENT_720_AND_CLIENT_POSTER_MUST_BE_VERIFIED_BEFORE_READY'));
  assert(checkMediaPipeline({...baseline,
    galleryWorker:baseline.galleryWorker.replace('input.objects.delete(key,signal.signal)','undefined')})
    .includes('GALLERY_WORKER_S3_MOVE_DELETE_MISSING'));
  assert(checkMediaPipeline({...baseline,
    questionsWorker:baseline.questionsWorker.replace('cleanup:questionsPhotoCleanupInternal','cleanup:obsoleteCleanup')})
    .includes('QUESTIONS_OR_GALLERY_WORKER_STORAGE_MAINTENANCE_MISSING'));
});
