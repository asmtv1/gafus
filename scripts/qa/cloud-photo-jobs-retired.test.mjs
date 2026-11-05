import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {CLOUDRU_PRODUCTION_JOBS} from '../../infra/cloudru/production-job-inventory.mjs';
const read = path=>readFileSync(path,'utf8');
const denied = /gafus-(?:feed-photo|questions-photo|chat-photo|gallery-process)(?:-2)?$/;

test('ONLY four actual Cloud.ru Jobs remain; every image/photo Job is denied',()=>{
 const names=CLOUDRU_PRODUCTION_JOBS.map(j=>j.name).sort();
 assert.deepEqual(names,['gafus-chat-video','gafus-chat-video-2',
   'gafus-feed-video','gafus-feed-video-2']);
 assert(!names.some(name=>denied.test(name)));
 const worker=read('packages/worker/src/cloudru-media-dispatcher.ts');
 assert(!worker.includes('createCloudruGalleryPoolDispatcher'));
 assert(!worker.includes('gafus-gallery-process'));
 assert(!worker.includes('gafus-feed-photo'));
 assert(!worker.includes('gafus-chat-photo'));
});

test('Gallery housekeeping is local S3 janitor, never Cloud Gallery wake',()=>{
 const cron=read('packages/worker/src/cron-scheduler.ts');
 assert(cron.includes('runGalleryLocalMaintenanceTick'));
 assert(!cron.includes('gallery-cloud-recovery'));
 assert(!existsSync('packages/worker/src/gallery-cloud-recovery.ts'));
 const janitor=read('packages/worker/src/gallery-local-maintenance.ts');
 for(const keyword of ['core.maintenance({limit:10})','claimStorageJobs({limit:1})',
   'objects.delete','objects.create','completeStorageJob','failStorageJob'])
  assert(janitor.includes(keyword),keyword);
 assert(!janitor.includes('containers.api.cloud.ru'));
 assert(janitor.includes('GALLERY_LOCAL_STORAGE_JANITOR_ENABLED!=="true"'));
 assert(cron.includes('runChat2PhotoCleanupTick'));
 assert(cron.includes('runGalleryLocalMaintenanceTick'));
 const chatCleanup=read('packages/worker/src/chat2-photo-cleanup.ts');
 assert(chatCleanup.includes('"http://api:3001"'));
 assert(!chatCleanup.includes('CLOUDRU_MEDIA_JOBS_ENABLED'));
 const feedSchema=read('packages/feed-server/src/internal.ts');
 assert(feedSchema.includes('workerType: z.literal("video")'));
 const maintenance=read('packages/core/src/services/gallery/worker.ts');
 assert(maintenance.includes('const processUploadIds: string[] = [];'));
 assert(!maintenance.includes('processUploadIds.push('));
 assert(maintenance.includes('LEGACY_PHOTO_PROCESSOR_RETIRED'));
 assert(maintenance.includes('job.kind === "publish" &&'));
 assert(maintenance.includes('await failJob(tx, job, now(), "LEGACY_PHOTO_PROCESSOR_RETIRED", false)'));
 const manifest=read('infra/cloudru/media-manifests.mjs');
 assert(!manifest.includes('gafus-gallery-process'));
 assert(!existsSync('.github/workflows/gallery-worker-publish.yml'));
});

test('Feed S3 cleanup and historical photo migrations never wake a Cloud video Job',()=>{
 const cron=read('packages/worker/src/cron-scheduler.ts');
 assert(cron.includes('runFeedLocalMaintenanceTick'));
 const recovery=read('packages/worker/src/feed-media-recovery.ts');
 assert(recovery.includes('row.kind === "publish_video"'));
 assert(!recovery.includes('"delete_keys", "cleanup_source"'));
 const worker=read('packages/worker/src/feed-local-maintenance.ts');
 for(const key of ['maintenance.run(10)','input.objects.delete(',
   'input.objects.exists(','input.jobs.complete(','input.jobs.claim(1,undefined,'])
  assert(worker.includes(key),key);
 assert(!worker.includes('containers.api.cloud.ru'));
 const storage=read('packages/feed-storage/src/janitor.ts');
 assert(storage.includes("env.NODE_ENV!=='production'"));
 assert(storage.includes("bucket!=='gafus-feed-private'"));
 const jobs=read('packages/core/src/services/feed/jobs.ts');
 assert(jobs.includes('workerType === "video" ? ["primary", "background"]'));
 assert(jobs.includes('workerType !== undefined || exactMedia'));
 const feedInternal=read('packages/feed-server/src/internal.ts');
 assert(feedInternal.includes('workerType: z.literal("video")'));
 assert(!feedInternal.includes('workerType: z.literal("video").optional()'));
 const maintain=read('packages/core/src/services/feed/maintenance.ts');
 assert(maintain.includes('retireLegacyPhotoJobs'));
 assert(maintain.includes('"publish_photo", "copy_album"'));
 assert(maintain.includes('errorCode: "PHOTO_JOB_RETIRED"'));
 const compose=read('ci-cd/docker/docker-compose.prod.yml');
 assert(compose.includes('FEED_LOCAL_STORAGE_JANITOR_ENABLED=${FEED_LOCAL_STORAGE_JANITOR_ENABLED:-true}'));
 assert(compose.includes('GALLERY_LOCAL_STORAGE_JANITOR_ENABLED=${GALLERY_LOCAL_STORAGE_JANITOR_ENABLED:-true}'));
});

test('Questions and Chat2 old photo queues never wait indefinitely for deleted Jobs',()=>{
 const questions=read('apps/api/src/modules/questions/media-v2-jobs.ts');
 const chat=read('apps/api/src/modules/chat2/media-v2-jobs.ts');
 for(const queue of [questions,chat]){
  assert(queue.includes('errorCode:"PHOTO_JOB_RETIRED"'));
  assert(queue.includes('cleanupKind:"ALL"'));
 }
 assert(questions.includes('status:"QUEUED"'));
 assert(chat.includes('status:"QUEUED",sourceMime:{startsWith:"image/"}'));
 const server=read('apps/api/src/routes/internal/chat2-media-jobs.ts');
 assert(server.includes('z.literal("video")'));
});

test('Photo entrypoints are always browser/device WebP + client confirmation',()=>{
 const routes=read('packages/gallery-server/src/index.ts');
 assert(routes.includes('"client-reserve"'));
 assert(routes.includes('"client-complete"'));
 assert(!routes.includes('return gallery.confirmUpload(actorId'));
 const feed=read('packages/core/src/services/feed/service.ts');
 assert(feed.includes('async completeClientPhoto('));
 assert(feed.includes('async reserveClientRenditions('));
 assert(feed.includes('if (row.declaredMime !== "video/mp4")'));
 assert(!feed.includes('kind: "publish_photo"'));
 const chat=read('apps/api/src/modules/chat2/media-v2-upload.ts');
 assert(chat.includes('MEDIA_CLIENT_WEBP_REQUIRED'));
 assert(chat.includes('confirmClientChat2V2Upload'));
 const chatJob=read('apps/feed-cloud/src/chat2-job-entry.ts');
 assert(chatJob.includes('env.CHAT2_JOB_KIND!=="video"'));
 assert(!chatJob.includes('"image"|"video"'));
 const question=read('apps/api/src/routes/v1/questions.ts');
 assert(question.includes('client-confirm'));
 assert(question.includes('client-reservations'));
 const questionJob=read('apps/api/src/routes/internal/questions-media-jobs.ts');
 assert(questionJob.includes('new Set(["claim","complete","fail"])'));
 assert(!questionJob.includes('"renew"'));
});

test('Current Web and Mobile uploads cannot silently downgrade into removed photo Jobs',()=>{
 const mobileGallery=read('apps/mobile/src/features/gallery/uploads.tsx');
 assert(mobileGallery.includes('const clientProcessing = true;'));
 assert(mobileGallery.includes('uploads/client-reserve'));
 assert(mobileGallery.includes('/client-complete'));
 const mobileFeed=read('apps/mobile/src/features/feed/uploads.ts');
 assert(mobileFeed.includes('FEED_CLIENT_WEBP_REQUIRED'));
 assert(mobileFeed.includes('/client-complete'));
 const mobileChat=read('apps/mobile/src/features/chat2/api.ts');
 assert(mobileChat.includes('return uploadChat2ClientPhoto('));
 assert(mobileChat.includes('/client-confirm'));
 const webGallery=read('apps/web-vite/src/features/gallery/galleryApi.ts');
 assert(webGallery.includes('/uploads/client-reserve'));
 assert(webGallery.includes('/client-complete'));
 const webChat=read('apps/web-vite/src/features/chats/chat2Api.ts');
 assert(webChat.includes('/client-reserve'));
 const webFeed=read('apps/web-vite/src/features/moments/feedMediaTransfer.ts');
 assert(webFeed.includes('/client-complete'));
 const webQuestion=read('apps/web-vite/src/features/questions/questionMedia.ts');
 assert(webQuestion.includes('/client-confirm'));
 const mobileQuestion=read('apps/mobile/src/shared/lib/api/questions.ts');
 assert(mobileQuestion.includes('/client-confirm'));
});

test('No photo/cloud bootstrap or manual registry publishing in active release flows',()=>{
 const workflow=read('.github/workflows/cloudru-media-images.yml');
 assert(!workflow.includes('media: gallery'));
 assert(!workflow.includes('media: questions'));
 assert(!workflow.includes('role: photo'));
 const publishing=read('ci-cd/scripts/publish-cloudru-image.sh');
 assert(!publishing.includes('gallery:worker:Dockerfile'));
 const script=read('infra/cloudru/deploy-staging-media-jobs.mjs');
 assert(!script.includes('gafus-gallery-process-staging'));
 assert(!script.includes('gafus-feed-photo-staging'));
 const vet=read('packages/core/src/services/pets/petVetVisitService.ts');
 assert(vet.includes('const asyncPreview = false;'));
 assert(!vet.includes('kind: "vetPreview"'));
 for(const removed of [
  'infra/cloudru/seed-isolated-media-e2e.mjs',
  'infra/cloudru/verify-isolated-media-e2e.mts',
  'apps/api/src/test/ag1-feed-ready-real-worker-work-http.acceptance.ts',
  'apps/api/src/test/web4-mixed-photo-poll-ready-r37.acceptance.ts',
 ])assert(!existsSync(removed),'retired old sharp-worker fixture must not recreate publish_photo: '+removed);
 const apiQueue=read('apps/api/src/modules/questions/media-v2-jobs.ts');
 assert(!apiQueue.includes('questionsV2Delete'));
 assert(!apiQueue.includes('cleanupOne('));
 assert(apiQueue.includes('claimCleanup,completeCleanup,failCleanup'));
 const questionsWorker=read('packages/worker/src/questions-photo-recovery.ts');
 assert(questionsWorker.includes('questionsV2Delete'));
 assert(questionsWorker.includes('questionsV2CleanupKeys'));
 assert(questionsWorker.includes('"claim"'));
 assert(questionsWorker.includes('"complete"'));
 assert(questionsWorker.includes('"fail"'));
 const questionsCron=read('packages/worker/src/cron-scheduler.ts');
 const section=questionsCron.slice(questionsCron.indexOf('Questions S3 cleanup'),
   questionsCron.indexOf('// Independent durable Beget'));
 assert(!section.includes('CLOUDRU_MEDIA_JOBS_ENABLED'));
 assert(!section.includes('QUESTIONS_V2_PROCESSOR_READY'));
});
