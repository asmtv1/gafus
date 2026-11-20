import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=new URL('../../',import.meta.url);
const src=readFileSync(new URL('ci-cd/docker/check-runtime-package-exports.mjs',root),'utf8');
const legacyPackageNames=['core-client','achievements-server','consent-server','mobile-intro-server','notifications-server','feature-flags-server','admin-rewarded-ads-server','tracking-server','admin-reengagement-server'];
const packageNames=[...legacyPackageNames,'subscription-read-server','subscription-write-server','statistics','logger','feed-server','questions-server','consultation-server','exam-server','gallery-server','course-server','pets-server','media-server','article-server','gafus-server','entitlements-server','course-read-server','trainer-ai-server','course-progress-server','identity-write-server','consultation-query-server','subscription-finance-server','subscription-trial-server','questions-write-server','consultation-write-server','subscription-payment-server','subscription-shared','questions-shared','pets-shared','media-shared'];
const manifestFor=(pkg)=>JSON.parse(readFileSync(new URL(`packages/${pkg}/package.json`,root),'utf8'));
const actualManifestCount=packageNames.reduce((n,pkg)=>n+Object.keys(manifestFor(pkg).exports).length,0);
const newChat2Export = './chat2/realtime-subscription';
const newReminderExport = './trainingReminderClaims';
const newReminderDeliveryExport = './training-reminder-delivery';
const newAdminBroadcastExport = './adminBroadcastService';
const newPushSubscriptionsExport = './push-subscriptions';
const newGafusDeliveryExport = './gafus-delivery';
const newSmartFeedExport = './smart-persistence';
const newPublicStatsExport = './platform-stats';
const newStaffSearchExport = './user-search';
const newRetiredFeedPhotoExport = './retired-photo-queue';
const newGafusReactionProgressExport = './gafus-reaction-progress';
const newQuestionNotificationExport = './notifications';
const newTrainerEditorCountsExport = './trainer-editor-counts';
const newTrainerVideoPlaybackExport = './trainer-video-playback';
const newFeedRuntimeExport = './runtime-services';
const newFeedBackgroundExport = './background-operations';
const newConsultationAdminExport = './admin-bookings';
const newConsultationReadbackExport = './booking-readback';
const newConsultationVoxExport = './vox';
const newExamCleanupExport = './cleanup';
const newGalleryRuntimeExport = './runtime-service';
const newGalleryRecoveryExport = './cloud-recovery';
const newQuestionsPhotosExport = './photos';
const newCourseCatalogExport = './public-catalog';
const newCoursePersonalizationExport = './personalization';
const newCourseReviewsExport = './reviews';
const newCourseFavoritesExport = './favorites';
const newCourseMiniGuidesExport = './mini-guides';
const newCourseCacheRevisionExport = './cache-revision';
const newOnlineStepBindingExport = './online-step-binding';
const newConsultationMailDeliveryExport = './mail-delivery';
const newPetsWeightExport = './weight';
assert.ok(manifestFor('core-client').exports[newChat2Export], 'new Chat2 client export is mandatory');
assert.ok(manifestFor('core-client').exports['./chat2/send-attempt'], 'Chat2 send attempt export is mandatory');
assert.ok(manifestFor('notifications-server').exports['./chat-outbox-diagnostics'], 'Chat2 outbox diagnostics export is mandatory');
assert.ok(manifestFor('notifications-server').exports[newReminderExport], 'isolated reminder export is mandatory');
assert.ok(manifestFor('notifications-server').exports[newReminderDeliveryExport], 'daily reminder DB lease/acknowledgement must have compiled infrastructure export');
assert.ok(manifestFor('notifications-server').exports[newAdminBroadcastExport], 'admin broadcast export is mandatory');
assert.ok(manifestFor('notifications-server').exports[newPushSubscriptionsExport], 'signed-session owner-scoped push endpoint binding required');
assert.ok(manifestFor('notifications-server').exports[newGafusDeliveryExport], 'durable lease-fenced Gafus push outbox adapter required');
assert.ok(manifestFor('feed-server').exports[newGafusReactionProgressExport], 'author-scoped post-reaction Gafus progress projection required');
assert.ok(manifestFor('feed-server').exports[newSmartFeedExport], 'SQL Smart Feed export is mandatory');
assert.ok(manifestFor('statistics').exports[newPublicStatsExport], 'public aggregate export is mandatory');
assert.ok(manifestFor('statistics').exports[newStaffSearchExport], 'staff search export is mandatory');
assert.ok(manifestFor('feed-server').exports[newRetiredFeedPhotoExport], 'retired photo queue export is mandatory');
assert.ok(manifestFor('questions-server').exports[newQuestionNotificationExport], 'question notification export is mandatory');
assert.ok(manifestFor('statistics').exports[newTrainerEditorCountsExport], 'trainer membership checks mandatory');
assert.ok(manifestFor('statistics').exports[newTrainerVideoPlaybackExport], 'owner-checked trainer video projection mandatory');
assert.ok(manifestFor('feed-server').exports[newFeedRuntimeExport], 'feed runtime composition export mandatory');
assert.ok(manifestFor('feed-server').exports[newFeedBackgroundExport], 'feed cron maintenance export mandatory');
assert.ok(manifestFor('consultation-server').exports[newConsultationAdminExport], 'admin booking read required for API only');
assert.ok(manifestFor('consultation-server').exports[newConsultationReadbackExport], 'lost ACK readback required for API only');
assert.ok(manifestFor('consultation-server').exports[newConsultationVoxExport], 'provider admission ACL required for API only');
assert.ok(manifestFor('exam-server').exports[newExamCleanupExport], 'Worker expiring exam video cleanup CAS required');
assert.ok(manifestFor('gallery-server').exports[newGalleryRuntimeExport], 'Gallery DB composition required');
assert.ok(manifestFor('gallery-server').exports[newGalleryRecoveryExport], 'Gallery cloud due recovery required');
assert.ok(manifestFor('questions-server').exports[newQuestionsPhotosExport], 'Question photo owner-scoped delete required');
assert.ok(manifestFor('course-server').exports[newCourseCatalogExport], 'anonymous-safe public course projection required');
assert.ok(manifestFor('course-server').exports[newCoursePersonalizationExport], 'user-scoped Course personalization write required');
assert.ok(manifestFor('course-server').exports[newCourseReviewsExport], 'owner-scoped course reviews and rating edits required');
assert.ok(manifestFor('course-server').exports[newCourseFavoritesExport], 'owner-scoped course favorites and idempotent writes required');
assert.ok(manifestFor('course-server').exports[newCourseMiniGuidesExport], 'protected mini-guide entitlement/HTML repository required');
assert.ok(manifestFor('course-server').exports[newCourseCacheRevisionExport], 'staff-rechecked transactional cache revision required');
assert.ok(manifestFor('course-server').exports[newOnlineStepBindingExport], 'course Web-only opt-in step binding adapter required');
assert.ok(manifestFor('consultation-server').exports[newConsultationMailDeliveryExport], 'durable consultation mail delivery required in API and Worker');
assert.ok(manifestFor('pets-server').exports[newPetsWeightExport], 'owner-locked pet weight API repository required');
assert.ok(manifestFor('tracking-server').exports['./walks'], 'owner-bound walk persistence compiled entrypoint is mandatory');
assert.ok(manifestFor('course-server').exports['./video-progress'], 'video progress repository compiled entrypoint is mandatory');
assert.ok(manifestFor('media-server').exports['./purge-repository'], 'lease-fenced CDN purge repository must be compiled');
assert.ok(manifestFor('media-server').exports['./trainer-transcoding'], 'trainer transcoding status adapter must be compiled');
assert.ok(manifestFor('article-server').exports['./likes'], 'atomic article like port must be compiled');
assert.ok(manifestFor('gafus-server').exports['./activity-read'], 'actor-bounded Gafus activity read must be compiled');
assert.ok(manifestFor('gafus-server').exports['./settings-read'], 'Gafus policy settings read must be compiled');
assert.ok(manifestFor('entitlements-server').exports['./policy-reads'], 'paid content ACL read must be compiled');
assert.ok(manifestFor('media-server').exports['./question-photo-task'], 'photo rendition task projection must be compiled');
assert.equal(legacyPackageNames.reduce((n,pkg)=>n+Object.keys(manifestFor(pkg).exports).length,0)-13,
  48, 'frozen nine-package exports must remain 48 excluding 13 approved new subpaths');
const write=(p,content)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,content);};
const perform=(mode,corrupt)=>{
  const dir=mkdtempSync(join(tmpdir(),'gafus-agent2-runtime-layout-'));
  try {
    write(join(dir,mode==='api'?'dist/index.js':'dist/worker/src/index.js'),'export {};');
    const physical=join(dir,'node_modules/.pnpm/@gafus+core@file+fixture/node_modules/@gafus');
    write(join(physical,'core/package.json'),JSON.stringify({name:'@gafus/core',type:'module'}));
    mkdirSync(join(dir,'node_modules/@gafus'),{recursive:true});
    symlinkSync('../.pnpm/@gafus+core@file+fixture/node_modules/@gafus/core',join(dir,'node_modules/@gafus/core'),'dir');
    for (const pkg of packageNames) {
      const manifest=manifestFor(pkg);
      const folder=join(physical,pkg);
      write(join(folder,'package.json'),JSON.stringify(manifest));
      for(const info of Object.values(manifest.exports)) {
        assert.ok(info.default && info.types);
        write(join(folder,info.default),'export {};');
        write(join(folder,info.types),'export {};');
      }
    }
    // Every new API/Worker ORM port must fail closed if a compiled entrypoint disappears.
    if (typeof corrupt === 'string' && corrupt.startsWith('extracted-port:')) {
      const [,pkg,subpath,kind] = corrupt.split(':');
      const manifest=manifestFor(pkg);
      const entry=manifest.exports[`./${subpath}`];
      assert.ok(entry, `Required test entry absent: ${pkg}/${subpath}`);
      const folder=join(physical,pkg);
      if(kind==='export'){
        delete manifest.exports[`./${subpath}`];
        write(join(folder,'package.json'),JSON.stringify(manifest));
      } else if(kind==='dts') unlinkSync(join(folder,entry.types));
      else if(kind==='js') unlinkSync(join(folder,entry.default));
      else throw Error(`Unexpected test corruption: ${corrupt}`);
    } else if (corrupt==='legacy-nested-dts') {
      // Preserve strict original negative: nested JS+manifest exist, DTS missing.
      unlinkSync(join(physical,'core-client/dist/utils/age/index.d.ts'));
    } else if (corrupt==='extracted-root-dts') {
      unlinkSync(join(physical,'subscription-read-server/dist/index.d.ts'));
    } else if (corrupt==='extracted-package-missing') {
      unlinkSync(join(physical,'subscription-read-server/package.json'));
    } else if (corrupt==='extracted-nested-dts') {
      // Independently prove any NEW nested export is also checked, even when
      // today's new domain only exposes its actual root manifest export.
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      const specifier='./qa-missing-nested-dts';
      assert.equal(manifest.exports[specifier],undefined);
      manifest.exports[specifier]={types:'./dist/qa-missing-nested-dts.d.ts',default:'./dist/qa-missing-nested-dts.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-missing-nested-dts.js'),'export {};');
    } else if (corrupt==='extracted-nested-js') {
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      const specifier='./qa-missing-nested-js';
      assert.equal(manifest.exports[specifier],undefined);
      manifest.exports[specifier]={types:'./dist/qa-missing-nested-js.d.ts',default:'./dist/qa-missing-nested-js.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-missing-nested-js.d.ts'),'export {};');
    } else if (corrupt==='extracted-export-extra') {
      const folder=join(physical,'subscription-read-server');
      const manifest=manifestFor('subscription-read-server');
      manifest.exports['./qa-extra']={types:'./dist/qa-extra.d.ts',default:'./dist/qa-extra.js'};
      write(join(folder,'package.json'),JSON.stringify(manifest));
      write(join(folder,'dist/qa-extra.js'),'export {};');
      write(join(folder,'dist/qa-extra.d.ts'),'export {};');
    } else if (corrupt==='dog-walks-export-removed') {
      const folder=join(physical,'tracking-server');
      const manifest=manifestFor('tracking-server');
      delete manifest.exports['./walks'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='dog-walks-dts-missing') {
      unlinkSync(join(physical,'tracking-server/dist/walks.d.ts'));
    } else if (corrupt==='media-purge-export-removed') {
      const folder=join(physical,'media-server');
      const manifest=manifestFor('media-server');
      delete manifest.exports['./purge-repository'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='media-purge-js-missing') {
      unlinkSync(join(physical,'media-server/dist/mediaCdnPurgeRepository.js'));
    } else if (corrupt==='media-purge-dts-missing') {
      unlinkSync(join(physical,'media-server/dist/mediaCdnPurgeRepository.d.ts'));
    } else if (corrupt==='trainer-transcoding-export-removed') {
      const folder=join(physical,'media-server');
      const manifest=manifestFor('media-server');
      delete manifest.exports['./trainer-transcoding'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='trainer-transcoding-dts-missing') {
      unlinkSync(join(physical,'media-server/dist/trainerTranscoding.d.ts'));
    } else if (corrupt==='profile-rows-export-removed') {
      const folder=join(physical,'identity-write-server');
      const manifest=manifestFor('identity-write-server');
      delete manifest.exports['./profile-rows'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='profile-rows-js-missing') {
      unlinkSync(join(physical,'identity-write-server/dist/profileRows.js'));
    } else if (corrupt==='profile-rows-dts-missing') {
      unlinkSync(join(physical,'identity-write-server/dist/profileRows.d.ts'));
    } else if (corrupt==='email-account-rows-export-removed') {
      const folder=join(physical,'identity-write-server');
      const manifest=manifestFor('identity-write-server');
      delete manifest.exports['./email-account-rows'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='email-account-rows-js-missing') {
      unlinkSync(join(physical,'identity-write-server/dist/emailAccountRows.js'));
    } else if (corrupt==='email-account-rows-dts-missing') {
      unlinkSync(join(physical,'identity-write-server/dist/emailAccountRows.d.ts'));
    } else if (corrupt==='training-day-rows-export-removed') {
      const folder=join(physical,'course-progress-server');
      const manifest=manifestFor('course-progress-server');
      delete manifest.exports['./training-day-rows'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='training-day-rows-js-missing') {
      unlinkSync(join(physical,'course-progress-server/dist/trainingDayRows.js'));
    } else if (corrupt==='training-day-rows-dts-missing') {
      unlinkSync(join(physical,'course-progress-server/dist/trainingDayRows.d.ts'));
    } else if (corrupt==='course-video-progress-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports['./video-progress'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='course-video-progress-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/videoProgressService.d.ts'));
    } else if (corrupt==='consultation-mail-export-removed') {
      const folder=join(physical,'consultation-server');
      const manifest=manifestFor('consultation-server');
      delete manifest.exports[newConsultationMailDeliveryExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='consultation-mail-compiled-js-missing') {
      unlinkSync(join(physical,'consultation-server/dist/consultationEmailDelivery.js'));
    } else if (corrupt==='online-step-binding-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports[newOnlineStepBindingExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='online-step-binding-js-missing') {
      unlinkSync(join(physical,'course-server/dist/onlineStepBindingService.js'));
    } else if (corrupt==='online-step-binding-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/onlineStepBindingService.d.ts'));
    } else if (corrupt==='course-cache-revision-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports[newCourseCacheRevisionExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='course-cache-revision-js-missing') {
      unlinkSync(join(physical,'course-server/dist/cacheRevisionService.js'));
    } else if (corrupt==='course-cache-revision-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/cacheRevisionService.d.ts'));
    } else if (corrupt==='course-mini-guides-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports[newCourseMiniGuidesExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='course-mini-guides-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/miniGuideService.d.ts'));
    } else if (corrupt==='course-reviews-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports[newCourseReviewsExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='course-favorites-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/favoriteService.d.ts'));
    } else if (corrupt==='course-catalog-export-removed') {
      const folder=join(physical,'course-server');
      const manifest=manifestFor('course-server');
      delete manifest.exports[newCourseCatalogExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='course-personalization-dts-missing') {
      unlinkSync(join(physical,'course-server/dist/personalizationService.d.ts'));
    } else if (corrupt==='pets-weight-export-removed') {
      const folder=join(physical,'pets-server');
      const manifest=manifestFor('pets-server');
      delete manifest.exports[newPetsWeightExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='pets-weight-dts-missing') {
      unlinkSync(join(physical,'pets-server/dist/weightService.d.ts'));
    } else if (corrupt==='question-photos-export-removed') {
      const folder=join(physical,'questions-server');
      const manifest=manifestFor('questions-server');
      delete manifest.exports[newQuestionsPhotosExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='question-photos-dts-missing') {
      unlinkSync(join(physical,'questions-server/dist/photos.d.ts'));
    } else if (corrupt==='gallery-runtime-export-removed') {
      const folder=join(physical,'gallery-server');
      const manifest=manifestFor('gallery-server');
      delete manifest.exports[newGalleryRuntimeExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='gallery-recovery-compiled-dts-missing') {
      unlinkSync(join(physical,'gallery-server/dist/recovery.d.ts'));
    } else if (corrupt==='exam-cleanup-export-removed') {
      const folder=join(physical,'exam-server');
      const manifest=manifestFor('exam-server');
      delete manifest.exports[newExamCleanupExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='exam-cleanup-compiled-dts-missing') {
      unlinkSync(join(physical,'exam-server/dist/cleanupService.d.ts'));
    } else if (corrupt==='consultation-vox-export-removed') {
      const folder=join(physical,'consultation-server');
      const manifest=manifestFor('consultation-server');
      delete manifest.exports[newConsultationVoxExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='consultation-vox-compiled-js-missing') {
      unlinkSync(join(physical,'consultation-server/dist/voximplantService.js'));
    } else if (corrupt==='consultation-admin-export-removed') {
      const folder=join(physical,'consultation-server');
      const manifest=manifestFor('consultation-server');
      delete manifest.exports[newConsultationAdminExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='consultation-readback-dts-missing') {
      unlinkSync(join(physical,'consultation-server/dist/bookingIdempotencyReadback.d.ts'));
    } else if (corrupt==='feed-runtime-export-removed') {
      const folder=join(physical,'feed-server');
      const manifest=manifestFor('feed-server');
      delete manifest.exports[newFeedRuntimeExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='feed-background-export-dts-missing') {
      unlinkSync(join(physical,'feed-server/dist/backgroundOperations.d.ts'));
    } else if (corrupt==='trainer-video-export-removed') {
      const folder=join(physical,'statistics');
      const manifest=manifestFor('statistics');
      delete manifest.exports[newTrainerVideoPlaybackExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='trainer-count-export-dts-missing') {
      unlinkSync(join(physical,'statistics/dist/trainer-editor-counts.d.ts'));
    } else if (corrupt==='question-export-removed') {
      const folder=join(physical,'questions-server');
      const manifest=manifestFor('questions-server');
      delete manifest.exports[newQuestionNotificationExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='retired-photo-export-removed') {
      const folder=join(physical,'feed-server');
      const manifest=manifestFor('feed-server');
      delete manifest.exports[newRetiredFeedPhotoExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='gafus-reaction-export-removed') {
      const folder=join(physical,'feed-server');
      const manifest=manifestFor('feed-server');
      delete manifest.exports[newGafusReactionProgressExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='gafus-reaction-dts-missing') {
      unlinkSync(join(physical,'feed-server/dist/gafusReactionProgress.d.ts'));
    } else if (corrupt==='smart-export-removed') {
      const folder=join(physical,'feed-server');
      const manifest=manifestFor('feed-server');
      delete manifest.exports[newSmartFeedExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='smart-export-dts-missing') {
      unlinkSync(join(physical,'feed-server/dist/smart-persistence.d.ts'));
    } else if (corrupt==='staff-search-export-removed') {
      const folder=join(physical,'statistics');
      const manifest=manifestFor('statistics');
      delete manifest.exports[newStaffSearchExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='gafus-delivery-export-removed') {
      const folder=join(physical,'notifications-server');
      const manifest=manifestFor('notifications-server');
      delete manifest.exports[newGafusDeliveryExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='gafus-delivery-js-missing') {
      unlinkSync(join(physical,'notifications-server/dist/gafus-delivery.js'));
    } else if (corrupt==='gafus-delivery-dts-missing') {
      unlinkSync(join(physical,'notifications-server/dist/gafus-delivery.d.ts'));
    } else if (corrupt==='push-subscriptions-export-removed') {
      const folder=join(physical,'notifications-server');
      const manifest=manifestFor('notifications-server');
      delete manifest.exports[newPushSubscriptionsExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='push-subscriptions-dts-missing') {
      unlinkSync(join(physical,'notifications-server/dist/push-subscriptions.d.ts'));
    } else if (corrupt==='broadcast-export-removed') {
      const folder=join(physical,'notifications-server');
      const manifest=manifestFor('notifications-server');
      delete manifest.exports[newAdminBroadcastExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='broadcast-export-dts-missing') {
      unlinkSync(join(physical,'notifications-server/dist/adminBroadcastService.d.ts'));
    } else if (corrupt==='reminder-delivery-export-removed') {
      const folder=join(physical,'notifications-server');
      const manifest=manifestFor('notifications-server');
      delete manifest.exports[newReminderDeliveryExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='reminder-delivery-js-missing') {
      unlinkSync(join(physical,'notifications-server/dist/training-reminder-delivery.js'));
    } else if (corrupt==='reminder-delivery-dts-missing') {
      unlinkSync(join(physical,'notifications-server/dist/training-reminder-delivery.d.ts'));
    } else if (corrupt==='reminder-export-removed') {
      const folder=join(physical,'notifications-server');
      const manifest=manifestFor('notifications-server');
      delete manifest.exports[newReminderExport];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='reminder-export-dts-missing') {
      unlinkSync(join(physical,'notifications-server/dist/trainingReminderClaims.d.ts'));
    } else if (corrupt==='chat2-export-removed') {
      const folder=join(physical,'core-client');
      const manifest=manifestFor('core-client');
      delete manifest.exports[newChat2Export];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    } else if (corrupt==='legacy-export-removed') {
      // Attempted coverage reduction must fail even when remaining exports
      // all resolve, and cannot be hidden by extra new-domain exports.
      const folder=join(physical,'core-client');
      const manifest=manifestFor('core-client');
      delete manifest.exports['./utils/age/index'];
      write(join(folder,'package.json'),JSON.stringify(manifest));
    }
    const runner=join(dir,'runtime-checker.mjs');
    write(runner,src.replaceAll('/app/',`${dir}/`));
    // The positive full 171-export realpath graph may take >10s under CI disk
    // contention (e.g. simultaneous local iOS archive); keep every exact
    // fail-closed assertion, but do not turn an OS timeout into a fake failure.
    return spawnSync(process.execPath,[runner,mode],{encoding:'utf8',timeout:30000});
  } finally {rmSync(dir,{recursive:true,force:true});}
};
test('production guard resolves transitive exports from realpath pnpm symlink graph (api + worker)',()=>{
  for(const mode of ['api','worker']){
    const run=perform(mode,false);
    assert.equal(run.status,0,run.stderr);
const expectedPackages = mode === 'api' ? packageNames.length : packageNames.length - 1;
    const expectedExports = mode === 'api' ? actualManifestCount : actualManifestCount - 10;
    assert.match(run.stdout,new RegExp(`RUNTIME_PACKAGING_PASS target=${mode} packages=${expectedPackages} compiled_exports=${expectedExports}`));
  }
});
test('production guard fails closed on missing legacy NESTED declaration despite present manifest and JS',()=>{
  const run=perform('worker','legacy-nested-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/core-client\/utils\/age\/index compiled declarations/);
});
test('production guard fails closed when new extracted root compiled declaration is missing',()=>{
  const run=perform('api','extracted-root-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server compiled declarations/);
});
test('production guard requires the extracted package manifest',()=>{
  const run=perform('worker','extracted-package-missing');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_ENTRY_MISSING:@gafus\/subscription-read-server/);
});
test('production guard must resolve a newly added nested exported JS AND declaration',()=>{
  const run=perform('api','extracted-nested-dts');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server\/qa-missing-nested-dts compiled declarations/);
});
test('original nine-package 48-export baseline may never be silently reduced',()=>{
  const run=perform('worker','legacy-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_LEGACY_PACKAGE_EXPORT_COVERAGE_CHANGED:packages=9:exports=47/);
});

test('production guard fails closed when new nested exported JS is missing despite a declaration',()=>{
  const run=perform('worker','extracted-nested-js');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/subscription-read-server\/qa-missing-nested-js compiled JS/);
});

test('exact API 38/234 and Worker 37/224 deny extra new export despite both compiled targets',()=>{
  const run=perform('api','extracted-export-extra');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED:packages=38:exports=235/);
});

test('approved new Chat2 client mode is required without weakening 48 old exports',()=>{
  const run=perform('api','chat2-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_CHAT2_CLIENT_EXPORT_MISSING/);
});

test('owner-scoped profile and avatar row adapter remains mandatory in both runtime images',()=>{
  for(const corruption of ['profile-rows-export-removed','profile-rows-js-missing','profile-rows-dts-missing']) {
    for(const mode of ['api','worker']) {
      const result=perform(mode,corruption);
      assert.notEqual(result.status,0,`${mode}/${corruption}: must fail closed`);
      assert.match(result.stderr,/RUNTIME_(?:PACKAGE_MISSING|POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED)/);
    }
  }
});
test('email-account single-use receipts are required in both API and Worker runtime graphs',()=>{
  for(const corrupt of ['email-account-rows-export-removed','email-account-rows-js-missing','email-account-rows-dts-missing']) {
    for(const mode of ['api','worker']) {
      const result=perform(mode,corrupt);
      assert.notEqual(result.status,0,`${mode}/${corrupt}: must fail closed`);
      assert.match(result.stderr,/RUNTIME_(?:PACKAGE_MISSING|POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED)/);
    }
  }
});

test('training day owner-locked adapter is required in API and Worker package graphs, including JS and type declarations',()=>{
  for(const corruption of ['training-day-rows-export-removed','training-day-rows-js-missing','training-day-rows-dts-missing']) {
    for(const mode of ['api','worker']) {
      const result=perform(mode,corruption);
      assert.notEqual(result.status,0,`${mode} must fail on ${corruption}`);
      assert.match(result.stderr,/RUNTIME_(?:PACKAGE_MISSING|POSTSUBSCRIPTION_EXPORT_COVERAGE_CHANGED)/);
    }
  }
});
test('new isolated reminder runtime export is mandatory independently from 49 original legacy entries',()=>{
  const run=perform('worker','reminder-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_TRAINING_REMINDER_EXPORT_MISSING/);
});
test('new isolated reminder compiled declaration cannot disappear from deploy artifact',()=>{
  const run=perform('api','reminder-export-dts-missing');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/trainingReminderClaims compiled declarations/);
});

test('admin-only broadcast server entrypoint cannot be dropped or replaced with a Core ORM barrel',()=>{
  const run=perform('api','broadcast-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_ADMIN_BROADCAST_EXPORT_MISSING/);
});
test('admin-only broadcast compiled declarations must be shipped with the API and Worker',()=>{
  const run=perform('worker','broadcast-export-dts-missing');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/adminBroadcastService compiled declarations/);
});

test('SQL Smart Feed worker entrypoint cannot be omitted from the deployed graph',()=>{
  const run=perform('worker','smart-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_SMART_FEED_EXPORT_MISSING/);
});
test('SQL Smart Feed compiled declaration must be shipped with the worker',()=>{
  const run=perform('worker','smart-export-dts-missing');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/feed-server\/smart-persistence compiled declarations/);
});
test('staff username lookup export cannot silently disappear',()=>{
  const run=perform('api','staff-search-export-removed');
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/RUNTIME_STAFF_SEARCH_EXPORT_MISSING/);
});

test('question reconciliation worker export cannot be omitted from production image',()=>{
  const result=perform('worker','question-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_QUESTION_NOTIFICATIONS_EXPORT_MISSING/);
});
test('retired photo queue cleanup export cannot be omitted from production image',()=>{
  const result=perform('worker','retired-photo-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_RETIRED_FEED_PHOTO_EXPORT_MISSING/);
});

test('trainer video owner-only metadata projection is required in deployed graph',()=>{
  const result=perform('api','trainer-video-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_TRAINER_VIDEO_PLAYBACK_EXPORT_MISSING/);
});
test('trainer ownership and membership counts declaration is mandatory',()=>{
  const result=perform('api','trainer-count-export-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/statistics\/trainer-editor-counts compiled declarations/);
});

test('feed DB/runtime composition export must be included in production API image',()=>{
  const result=perform('api','feed-runtime-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_FEED_RUNTIME_EXPORT_MISSING/);
});
test('bounded Feed push/outbox maintenance declaration is mandatory in worker image',()=>{
  const result=perform('worker','feed-background-export-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/feed-server\/background-operations compiled declarations/);
});

test('API-only admin booking module cannot be omitted from API runtime image',()=>{
  const result=perform('api','consultation-admin-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_CONSULTATION_ADMIN_EXPORT_MISSING/);
});
test('lost ACK booking readback compiled DTS is mandatory in API artifact',()=>{
  const result=perform('api','consultation-readback-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/consultation-server\/booking-readback compiled declarations/);
});

test('Voximplant owner-scoped provider admission must be shipped in the API image',()=>{
  const result=perform('api','consultation-vox-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_CONSULTATION_VOX_EXPORT_MISSING/);
});
test('Voximplant provider compiled JS cannot silently disappear from API image',()=>{
  const result=perform('api','consultation-vox-compiled-js-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/consultation-server\/vox compiled JS/);
});

test('exam worker only cleanup export cannot silently vanish from Worker image',()=>{
  const result=perform('worker','exam-cleanup-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_EXAM_CLEANUP_EXPORT_MISSING/);
});
test('exact-url exam cleanup compiled types must be shipped with worker',()=>{
  const result=perform('worker','exam-cleanup-compiled-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/exam-server\/cleanup compiled declarations/);
});

test('Gallery S3/Prisma composition must be exported to API and worker images',()=>{
  const result=perform('api','gallery-runtime-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_GALLERY_RUNTIME_EXPORT_MISSING/);
});
test('Gallery due-recovery typed compiled declaration must ship with Worker',()=>{
  const result=perform('worker','gallery-recovery-compiled-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/gallery-server\/cloud-recovery compiled declarations/);
});

test('question photo owner-checked deletion is required in both deployed graphs',()=>{
  const result=perform('api','question-photos-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_QUESTIONS_PHOTOS_EXPORT_MISSING/);
});
test('question photo janitor compiled declarations must be present in worker image',()=>{
  const result=perform('worker','question-photos-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/questions-server\/photos compiled declarations/);
});

test('public catalog anonymization port must ship in API image',()=>{
  const result=perform('api','course-catalog-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_COURSE_PUBLIC_CATALOG_EXPORT_MISSING/);
});
test('personalization SQL port declarations must be present in API image',()=>{
  const result=perform('api','course-personalization-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/course-server\/personalization compiled declarations/);
});

test('worker image cannot silently omit consultation transactional-mail settlement',()=>{
  const result=perform('worker','consultation-mail-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_CONSULTATION_MAIL_DELIVERY_EXPORT_MISSING/);
});
test('worker image requires runnable consultation mail-settlement compiled JavaScript',()=>{
  const result=perform('worker','consultation-mail-compiled-js-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/consultation-server\/mail-delivery compiled JS/);
});

test('API cannot lose owner-scoped course reviews server export',()=>{
  const result=perform('api','course-reviews-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_COURSE_REVIEWS_EXPORT_MISSING/);
});
test('API must ship compiled owner-scoped favorite service declaration',()=>{
  const result=perform('api','course-favorites-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/course-server\/favorites compiled declarations/);
});

test('push-subscription owner/session CAS compiled export must ship in both images',()=>{
  const result=perform('api','push-subscriptions-export-removed');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PUSH_SUBSCRIPTIONS_EXPORT_MISSING/);
});
test('push-subscription compiled type declarations must ship in Worker image',()=>{
  const result=perform('worker','push-subscriptions-dts-missing');
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/push-subscriptions compiled declarations/);
});

test('both runtime images require the lease-fenced Gafus notification delivery subpath',()=>{
  for(const mode of ['api','worker']){
    const result=perform(mode,'gafus-delivery-export-removed');
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/RUNTIME_GAFUS_DELIVERY_EXPORT_MISSING/);
  }
});
test('worker runtime must include compiled Gafus delivery JS and declarations',()=>{
  const js=perform('worker','gafus-delivery-js-missing');
  assert.notEqual(js.status,0);
  assert.match(js.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/gafus-delivery compiled JS/);
  const dts=perform('worker','gafus-delivery-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/gafus-delivery compiled declarations/);
});

test('API and Worker package graphs require author-scoped reaction progress projection',()=>{
  for(const mode of ['api','worker']){
    const result=perform(mode,'gafus-reaction-export-removed');
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/RUNTIME_GAFUS_REACTION_PROGRESS_EXPORT_MISSING/);
  }
});
test('API reaction progress compiled declaration must be present',()=>{
  const r=perform('api','gafus-reaction-dts-missing');
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/feed-server\/gafus-reaction-progress compiled declarations/);
});

test('API requires compiled entitlement-gated mini-guide service',()=>{
  const missing=perform('api','course-mini-guides-export-removed');
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/RUNTIME_COURSE_MINI_GUIDES_EXPORT_MISSING/);
  const dts=perform('api','course-mini-guides-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/course-server\/mini-guides compiled declarations/);
});

test('pet weight persistence owner checks cannot vanish from API image',()=>{
  const r=perform('api','pets-weight-export-removed');
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/RUNTIME_PETS_WEIGHT_EXPORT_MISSING/);
});
test('pet weight compiled declarations cannot silently vanish from API image',()=>{
  const r=perform('api','pets-weight-dts-missing');
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/pets-server\/weight compiled declarations/);
});

test('both images fail closed without durable training reminder delivery repository',()=>{
  for(const mode of ['api','worker']){
    const removed=perform(mode,'reminder-delivery-export-removed');
    assert.notEqual(removed.status,0);
    assert.match(removed.stderr,/RUNTIME_TRAINING_REMINDER_DELIVERY_EXPORT_MISSING/);
  }
});
test('both compiled SQL repository JS and declarations are mandatory in Worker',()=>{
  const js=perform('worker','reminder-delivery-js-missing');
  assert.notEqual(js.status,0);
  assert.match(js.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/training-reminder-delivery compiled JS/);
  const dts=perform('worker','reminder-delivery-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/notifications-server\/training-reminder-delivery compiled declarations/);
});

test('API requires owner-scoped compiled staff cache revision service',()=>{
  const missing=perform('api','course-cache-revision-export-removed');
  assert.notEqual(missing.status,0);
  assert.match(missing.stderr,/RUNTIME_COURSE_CACHE_REVISION_EXPORT_MISSING/);
  for(const [corrupt,suffix] of [
    ['course-cache-revision-js-missing','compiled JS'],
    ['course-cache-revision-dts-missing','compiled declarations'],
  ]){
    const result=perform('api',corrupt);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,new RegExp('RUNTIME_PACKAGE_MISSING:@gafus/course-server/cache-revision '+suffix));
  }
});

test('Question legacy deletion outbox requires schema and expand-first runtime guards',()=>{
  const schema=readFileSync(new URL('packages/prisma/schema.prisma',root),'utf8');
  const migration=readFileSync(new URL(
    'packages/prisma/migrations/20261107152500_question_legacy_photo_deletion_outbox/migration.sql',root),'utf8');
  const photos=readFileSync(new URL('packages/questions-server/src/photos.ts',root),'utf8');
  const scheduler=readFileSync(new URL('packages/worker/src/cron-scheduler.ts',root),'utf8');
  const workerHealth=readFileSync(new URL('packages/worker/src/health-server.ts',root),'utf8');
  assert.match(schema,/model QuestionLegacyPhotoDeletion \{/);
  assert.match(migration,/CREATE TABLE "QuestionLegacyPhotoDeletion"/);
  assert.match(migration,/CREATE INDEX "QuestionLegacyPhotoDeletion_status_availableAt_createdAt_idx"/);
  assert.doesNotMatch(migration,/^\s*(?:DROP|TRUNCATE|ALTER)\s/m);
  assert.match(photos,/await tx\.questionLegacyPhotoDeletion\.create\(/);
  assert.match(photos,/await tx\.questionPhoto\.delete\(/);
  const enqueue=photos.indexOf('await tx.questionLegacyPhotoDeletion.create(');
  const rowDelete=photos.indexOf('await tx.questionPhoto.delete(',enqueue);
  assert(enqueue>0 && rowDelete>enqueue,'must atomically persist intent before deleting row');
  const remote=photos.indexOf('await (options.deleteObject ?? deleteFileFromCDN)(exact)');
  assert(remote>rowDelete,'remote S3 operation only in Worker-owned post-commit processor');
  assert.match(scheduler,/QUESTIONS_LEGACY_PHOTO_DELETE_WORKER_ENABLED === "true"/);
  assert.match(workerHealth,/renderQuestionsLegacyDeletionMetricsPrometheus\(\)/);
});


test('API requires pure-Core-policy plus compiled course step-binding adapter',()=>{
  const absent=perform('api','online-step-binding-export-removed');
  assert.notEqual(absent.status,0);
  assert.match(absent.stderr,/RUNTIME_ONLINE_STEP_BINDING_EXPORT_MISSING/);
  for(const [corrupt,kind] of [
    ['online-step-binding-js-missing','compiled JS'],
    ['online-step-binding-dts-missing','compiled declarations'],
  ]){
    const result=perform('api',corrupt);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,new RegExp('RUNTIME_PACKAGE_MISSING:@gafus/course-server/online-step-binding '+kind));
  }
});


test('owner-bound walk API deployment requires explicit compiled adapter',()=>{
  const removed=perform('api','dog-walks-export-removed');
  assert.notEqual(removed.status,0);
  assert.match(removed.stderr,/RUNTIME_DOG_WALKS_EXPORT_MISSING/);
  const dts=perform('api','dog-walks-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/tracking-server\/walks compiled declarations/);
});
test('Worker cannot ship a CDN Beget purge executor without the fenced SQL repository',()=>{
  const removed=perform('worker','media-purge-export-removed');
  assert.notEqual(removed.status,0);
  assert.match(removed.stderr,/RUNTIME_MEDIA_PURGE_REPOSITORY_EXPORT_MISSING/);
  const js=perform('worker','media-purge-js-missing');
  assert.notEqual(js.status,0);
  assert.match(js.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/media-server\/purge-repository compiled JS/);
  const dts=perform('worker','media-purge-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/media-server\/purge-repository compiled declarations/);
});
test('Worker trainer transcoding status may never fall back to Core SQL',()=>{
  const removed=perform('worker','trainer-transcoding-export-removed');
  assert.notEqual(removed.status,0);
  assert.match(removed.stderr,/RUNTIME_TRAINER_TRANSCODING_EXPORT_MISSING/);
  const dts=perform('worker','trainer-transcoding-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/media-server\/trainer-transcoding compiled declarations/);
});
test('API course video progress persistence cannot be omitted from deployment',()=>{
  const removed=perform('api','course-video-progress-export-removed');
  assert.notEqual(removed.status,0);
  assert.match(removed.stderr,/RUNTIME_VIDEO_PROGRESS_EXPORT_MISSING/);
  const dts=perform('api','course-video-progress-dts-missing');
  assert.notEqual(dts.status,0);
  assert.match(dts.stderr,/RUNTIME_PACKAGE_MISSING:@gafus\/course-server\/video-progress compiled declarations/);
});

const requiredNewPorts = [
  ['article-server','likes','RUNTIME_ARTICLE_LIKES_EXPORT_MISSING'],
  ['article-server','article-rows','RUNTIME_ARTICLE_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','promo-code-rows','RUNTIME_PROMO_CODE_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','profit-dashboard-rows','RUNTIME_PROFIT_DASHBOARD_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','profit-video-rows','RUNTIME_PROFIT_VIDEO_ROWS_EXPORT_MISSING'],
  ['gafus-server','admin-rows','RUNTIME_GAFUS_ADMIN_ROWS_EXPORT_MISSING'],
  ['media-server','trainer-video-rows','RUNTIME_TRAINER_VIDEO_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','partner-rows','RUNTIME_PARTNER_ROWS_EXPORT_MISSING'],
  ['consultation-query-server','slot-rows','RUNTIME_SLOT_ROWS_EXPORT_MISSING'],
  ['pets-server','prevention-rows','RUNTIME_PREVENTION_ROWS_EXPORT_MISSING'],
  ['identity-write-server','account-deletion-rows','RUNTIME_ACCOUNT_DELETION_ROWS_EXPORT_MISSING'],
  ['gafus-server','rewarded-wallet-rows','RUNTIME_REWARDED_WALLET_ROWS_EXPORT_MISSING'],
  ['identity-write-server','auth-rows','RUNTIME_AUTH_ROWS_EXPORT_MISSING'],
  ['course-progress-server','trainer-course-rows','RUNTIME_TRAINER_COURSE_ROWS_EXPORT_MISSING'],
  ['gafus-server','rewarded-ad-rows','RUNTIME_REWARDED_AD_ROWS_EXPORT_MISSING'],
  ['course-progress-server','offline-video-rows','RUNTIME_OFFLINE_VIDEO_ROWS_EXPORT_MISSING'],
  ['course-progress-server','offline-mutation-rows','RUNTIME_OFFLINE_MUTATION_ROWS_EXPORT_MISSING'],
  ['course-progress-server','trainer-step-rows','RUNTIME_TRAINER_STEP_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','admin-rows','RUNTIME_ADMIN_ROWS_EXPORT_MISSING'],
  ['identity-write-server','reminder-review-rows','RUNTIME_REMINDER_REVIEW_ROWS_EXPORT_MISSING'],
  ['media-server','media-db-ports','RUNTIME_MEDIA_DB_PORTS_EXPORT_MISSING'],
  ['media-server','feed-ranked-rows','RUNTIME_FEED_RANKED_ROWS_EXPORT_MISSING'],
  ['pets-server','pet-rows','RUNTIME_PET_ROWS_EXPORT_MISSING'],
  ['exam-server','exam-service','RUNTIME_EXAM_SERVICE_EXPORT_MISSING'],
  ['exam-server','retention-policy','RUNTIME_EXAM_RETENTION_EXPORT_MISSING'],
  ['questions-write-server','service','RUNTIME_QUESTION_WRITE_SERVICE_EXPORT_MISSING'],
  ['questions-write-server','errors','RUNTIME_QUESTION_WRITE_ERRORS_EXPORT_MISSING'],
  ['questions-write-server','schemas','RUNTIME_QUESTION_WRITE_SCHEMAS_EXPORT_MISSING'],
  ['course-progress-server','training-service','RUNTIME_TRAINING_SERVICE_EXPORT_MISSING'],
  ['course-progress-server','daily-course-service','RUNTIME_DAILY_COURSE_SERVICE_EXPORT_MISSING'],
  ['consultation-write-server','service','RUNTIME_CONSULTATION_WRITE_SERVICE_EXPORT_MISSING'],
  ['consultation-write-server','validation','RUNTIME_CONSULTATION_WRITE_VALIDATION_EXPORT_MISSING'],
  ['subscription-payment-server','service','RUNTIME_PAYMENT_SERVICE_EXPORT_MISSING'],
  ['subscription-payment-server','payment-pure','RUNTIME_PAYMENT_PURE_EXPORT_MISSING'],
  ['subscription-payment-server','apple-environment','RUNTIME_PAYMENT_APPLE_ENV_EXPORT_MISSING'],
  ['subscription-payment-server','plans','RUNTIME_PAYMENT_PLANS_EXPORT_MISSING'],
  ['subscription-payment-server','promo-code','RUNTIME_PAYMENT_PROMO_EXPORT_MISSING'],
  ['subscription-payment-server','payment-finance','RUNTIME_PAYMENT_FINANCE_WRAPPER_EXPORT_MISSING'],
  ['subscription-payment-server','partner','RUNTIME_PAYMENT_PARTNER_EXPORT_MISSING'],
  ['subscription-payment-server','profit-math','RUNTIME_PAYMENT_PROFIT_EXPORT_MISSING'],
  ['gafus-server','activity-read','RUNTIME_GAFUS_ACTIVITY_READ_EXPORT_MISSING'],
  ['gafus-server','settings-read','RUNTIME_GAFUS_SETTINGS_READ_EXPORT_MISSING'],
  ['entitlements-server','policy-reads','RUNTIME_POLICY_READS_EXPORT_MISSING'],
  ['entitlements-server','rewarded-access-reads','RUNTIME_REWARDED_ACCESS_READS_EXPORT_MISSING'],
  ['media-server','question-photo-task','RUNTIME_QUESTION_PHOTO_TASK_EXPORT_MISSING'],
  ['pets-server','pet-reads','RUNTIME_PET_READ_EXPORT_MISSING'],
  ['course-read-server','course-path-read','RUNTIME_COURSE_PATH_READ_EXPORT_MISSING'],
  ['course-read-server','legacy-catalog-rows','RUNTIME_LEGACY_CATALOG_ROWS_EXPORT_MISSING'],
  ['trainer-ai-server','persistence','RUNTIME_TRAINER_AI_PERSISTENCE_EXPORT_MISSING'],
  ['course-read-server','content-revision','RUNTIME_COURSE_CONTENT_REVISION_EXPORT_MISSING'],
  ['gafus-server','wallet-lock','RUNTIME_GAFUS_WALLET_LOCK_EXPORT_MISSING'],
  ['course-progress-server','completion','RUNTIME_COURSE_PROGRESS_EXPORT_MISSING'],
  ['identity-write-server','password-reset','RUNTIME_PASSWORD_RESET_EXPORT_MISSING'],
  ['consultation-query-server','booking-eligibility','RUNTIME_CONSULTATION_ELIGIBILITY_EXPORT_MISSING'],
  ['subscription-finance-server','payment-finance','RUNTIME_PAYMENT_FINANCE_EXPORT_MISSING'],
  ['course-read-server','editor-snapshot','RUNTIME_COURSE_EDITOR_SNAPSHOT_EXPORT_MISSING'],
  ['subscription-trial-server','trial-usage','RUNTIME_SUBSCRIPTION_TRIAL_EXPORT_MISSING'],
  ['notifications-server','consultation-email-outbox','RUNTIME_CONSULTATION_EMAIL_OUTBOX_EXPORT_MISSING'],
  ['media-server','deleted-media-purge','RUNTIME_DELETED_MEDIA_PURGE_EXPORT_MISSING'],
  ['media-server','question-v2-cleanup','RUNTIME_QUESTION_V2_CLEANUP_EXPORT_MISSING'],
  ['subscription-finance-server','npd-operation-persistence','RUNTIME_NPD_OPERATION_EXPORT_MISSING'],
  ['pets-server','vet-visit-detail','RUNTIME_VET_VISIT_DETAIL_EXPORT_MISSING'],
  ['course-read-server','gafus-entitlement-reads','RUNTIME_GAFUS_ENTITLEMENT_READS_EXPORT_MISSING'],
  ['notifications-server','reminder-expiry-redaction','RUNTIME_REMINDER_EXPIRY_REDACTION_EXPORT_MISSING'],
  ['gafus-server','rewarded-settings','RUNTIME_REWARDED_SETTINGS_EXPORT_MISSING'],
  ['course-progress-server','course-version-rows','RUNTIME_COURSE_VERSION_ROWS_EXPORT_MISSING'],
  ['course-read-server','video-access-read','RUNTIME_VIDEO_ACCESS_READ_EXPORT_MISSING'],
  ['notifications-server','training-reminder-storage','RUNTIME_TRAINING_REMINDER_STORAGE_EXPORT_MISSING'],
  ['gafus-server','wallet-records','RUNTIME_GAFUS_WALLET_RECORDS_EXPORT_MISSING'],
  ['course-progress-server','diary-entries','RUNTIME_DIARY_ENTRIES_EXPORT_MISSING'],
  ['course-progress-server','survey-rows','RUNTIME_SURVEY_ROWS_EXPORT_MISSING'],
  ['course-progress-server','trainer-note-rows','RUNTIME_TRAINER_NOTE_ROWS_EXPORT_MISSING'],
  ['gafus-server','legacy-import-records','RUNTIME_LEGACY_IMPORT_RECORDS_EXPORT_MISSING'],
  ['pets-server','prevention-reminder-rows','RUNTIME_PREVENTION_REMINDER_ROWS_EXPORT_MISSING'],
  ['subscription-finance-server','npd-receipts','RUNTIME_NPD_RECEIPTS_EXPORT_MISSING'],
  ['subscription-finance-server','profit-reconciliation-rows','RUNTIME_PROFIT_RECONCILIATION_EXPORT_MISSING'],
  ['identity-write-server','registration-context-reads','RUNTIME_REGISTRATION_CONTEXT_READS_EXPORT_MISSING'],
  ['gafus-server','unlock-records','RUNTIME_GAFUS_UNLOCK_RECORDS_EXPORT_MISSING'],
  ['identity-write-server','account-cleanup-records','RUNTIME_ACCOUNT_CLEANUP_RECORDS_EXPORT_MISSING'],
  ['identity-write-server','account-cleanup-worker-rows','RUNTIME_ACCOUNT_CLEANUP_WORKER_ROWS_EXPORT_MISSING'],
  ['consultation-query-server','cynologist-catalog-rows','RUNTIME_CYNOLOGIST_CATALOG_ROWS_EXPORT_MISSING'],
  ['consultation-query-server','schedule-rows','RUNTIME_CONSULTATION_SCHEDULE_ROWS_EXPORT_MISSING'],
  ['identity-write-server','registration-contract-rows','RUNTIME_REGISTRATION_CONTRACT_ROWS_EXPORT_MISSING'],
  ['pets-server','pet-media-deletion-outbox','RUNTIME_PET_MEDIA_OUTBOX_EXPORT_MISSING'],
  ['pets-server','pet-media-deletion-sql','RUNTIME_PET_MEDIA_SQL_EXPORT_MISSING'],
  ['pets-server','pet-media-deletion-default','RUNTIME_PET_MEDIA_DEFAULT_DB_EXPORT_MISSING'],
  ['pets-server','vet-visit-write-rows','RUNTIME_VET_VISIT_WRITE_ROWS_EXPORT_MISSING'],
  ['subscription-shared','appleEnvironment','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['subscription-shared','paymentPure','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['subscription-shared','plans','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['subscription-shared','profitMath','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['subscription-shared','promoCode','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['questions-shared','errors','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['questions-shared','schemas','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['pets-shared','pet-media-deletion-outbox','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['pets-shared','vet-visit-error','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['media-shared','media-db-ports','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
  ['media-shared','purge-paths','RUNTIME_SHARED_CONTRACT_EXPORT_MISSING'],
];
for (const [pkg,subpath,guardCode] of requiredNewPorts) {
  test(`${pkg}/${subpath} must exist in both API and Worker graphs`,()=>{
    for(const mode of ['api','worker']){
      const result=perform(mode,`extracted-port:${pkg}:${subpath}:export`);
      assert.notEqual(result.status,0);
      assert.match(result.stderr,new RegExp(guardCode));
    }
  });
  test(`${pkg}/${subpath} requires compiled JS and DTS in both images`,()=>{
    for(const mode of ['api','worker']){
      for(const [kind,label] of [['js','JS'],['dts','declarations']]){
        const result=perform(mode,`extracted-port:${pkg}:${subpath}:${kind}`);
        assert.notEqual(result.status,0);
        assert.ok(result.stderr.includes(`RUNTIME_PACKAGE_MISSING:@gafus/${pkg}/${subpath} compiled ${label}`),result.stderr);
      }
    }
  });
}

test('API-only versioned course deletion export must be present in API image',()=>{
 const result=perform('api','extracted-port:course-server:course-delete-versioned:export');
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/RUNTIME_COURSE_DELETE_VERSIONED_EXPORT_MISSING/);
});
test('API-only versioned course deletion JS and DTS must be compiled',()=>{
 for(const [kind,label] of [['js','JS'],['dts','declarations']]){
  const result=perform('api',`extracted-port:course-server:course-delete-versioned:${kind}`);
  assert.notEqual(result.status,0);
  assert.ok(result.stderr.includes(`RUNTIME_PACKAGE_MISSING:@gafus/course-server/course-delete-versioned compiled ${label}`),result.stderr);
 }
});
