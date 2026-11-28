# Stage 11 — local acceptance, 2026-11-28
Historical baseline b9bfc537f; candidate 850874bf3; follow-up UI/test changes in this report's commit. Scope UI/build only. Physical iPhone/Android, GPS/background and OTA installation accepted by owner, not independently rerun. Production, merge and push untouched.

## Production Vite graph
Own frozen offline baseline dependencies; broad dependency build timed out, targeted core-client/ui-components succeeded, then all three historical Vite builds passed. Candidate and final UI-fix builds passed. Final comparison (bytes, static JS/CSS closure, no images/API; gzip level 9 individually per asset, not network transfer):

| Route | Historical raw | Final raw | Historical gzip | Final gzip |
|---|---:|---:|---:|---:|
| Web entry | 461973 | 463201 | 133037 | 133905 |
| Chat2 | 681581 | 685103 | 190701 | 193729 |
| /main-panel | 778019 | 596102 | 220596 | 177909 |
| Gallery grid | 1023861 | 1024952 | 280424 | 283185 |
| Admin entry | 514627 | 328975 | 149537 | 105336 |
| Trainer entry | 738053 | 725060 | 192235 | 188716 |

Admin user panel 343485, moderation 341422, analytics 351238 raw; each separately lazy. Historical TrainerCourseFullFormSourceMock20261023 absent in final Trainer module graph. Live consultation preview and Markdown preview names are not themselves mock evidence. Web/Admin no CDN-upload/AWS SDK module imports in final graph. Gallery owner and public routes previously eagerly included full viewer; both now lazy with Suspense inside modal. Grid excludes viewer; opening adds 2616 raw/1205 gzip bytes and one JS chunk. Grid raw falls 1260 bytes vs unfixed candidate, but gzip does not improve vs historical baseline. Web entry/Chat2 small size regressions remain, no arbitrary byte budget invented.

Repeatable: node scripts/qa/stage11-vite-graph.mjs build WORKTREE NEW_OUTPUT_DIR; node scripts/qa/stage11-vite-graph.mjs inspect OUTPUT_DIR --candidate (omit --candidate for baseline). Actual historical/final inspection exit 0; evidence in /tmp/gafus-stage11.gqGGqmgj/{historical,fixed2}-metrics.json and respective graph directories.

## Mounted checks
- Chat2Messenger.stage11.mounted.test.tsx: 180 messages, 12 draft updates. Historical replay of same test (without candidate-only zero row-format assertion) 4308 Date.toLocaleDateString calls vs 0 candidate, 12 profiler commits each; historical summed render time 6048.63 ms vs candidate 9.899 ms, diagnostic only due host load. Draft-phase mocked reads 0/0 in comparable first successful runs. Reconnect 2 commits each, reads 2/1, 720 format calls each. Later current pass: typing 9.357 ms, 0 formatting, 1 polling read; reconnect 6403 ms, 1 read. No stable absolute timing/reconnect speed conclusion; simulated transport only, draft preserved and new message shown.
- GalleryAlbums.ownerPhotoModal.test.tsx and PublicGalleryView.mounted.test.tsx 31/31 after waiting for actual lazy-loaded DOM; GalleryAlbums.nextControls.mounted.test.tsx 11/11 and Chat2 test passed in earlier combined run. Earlier combined run 37/43 due timing/interaction before lazy load. All failed scenarios in the two suites rerun exit 0. Tests retain access denial, revocation, URL refresh, focus, backdrop, swipe, no unauthorized writes.
- Admin App.integration.test.tsx 15/15 after extending two test-only lazy wait deadlines; UsersPanel.mounted, BoundedAdminPage, SubscriptionFilters 11/11 in prior combined run. Direct nested links, single auth check, Back/filter/page, restricted routes, selected user only. Mounted fixtures, not proof of real PostgreSQL pagination or form recovery.
- Trainer LiveTrainerApp.admin.mounted, TrainerFormUI, TR012CourseVersionActualHonoMounted20261022: 11/11. Registered Hono with fixture/mock Core, signed JWT, mounted form/version/access; not full live browser persistence/upload.
- Mobile FeedPersonalScreen, Chat2Room media, PetDetailRead, petsReadValidation.counts: 33/33. OwnProfileTab 36/36 separate after hook timeout on loaded host. 69 distinct tests; mounted, not simulator performance.

Commands: pnpm --filter @gafus/web-vite exec vitest run src/features/chats/Chat2Messenger.stage11.mounted.test.tsx src/features/gallery/GalleryAlbums.ownerPhotoModal.test.tsx src/features/gallery/GalleryAlbums.nextControls.mounted.test.tsx src/features/gallery/PublicGalleryView.mounted.test.tsx --maxWorkers=1 --testTimeout=45000 --hookTimeout=45000 (final rerun restricted to the two previously failing gallery suites, exit 0); pnpm --filter @gafus/admin-panel exec vitest run App.integration UsersPanel BoundedAdminPage SubscriptionFilters --maxWorkers=1 (filters documented by suite names above); corresponding trainer/mobile filtered vitest runs. Exact raw outputs under /tmp/gafus-stage11.gqGGqmgj: chat-profile-baseline-r2.log, chat-profile-current-r2.log, web-final.log, gallery-wait-r3.log, admin-mounted.log, admin-r2.log, trainer-mounted.log, mobile-mounted.log, mobile-profile-r2.log.

## Mobile production JS/Hermes export
From apps/mobile: EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 CI=1 pnpm exec expo config --type public --json; with same environment pnpm exec expo export --platform ios|android --output-dir NEW_DIR --dump-sourcemap --max-workers 2. Both platform exports completed (Android isolated retry exit 0). Manifest 1.7.6, runtime appVersion, scheme gafus, IDs ru.gafus.app. iOS 8741360 and Android 8825884 HBC bytes, 3473 source paths each, all four target screens verified in sourcemap. No historical native export, signed native build or simulator run; no matching candidate installed simulator binary, no booted iOS device, physical Android attached and left alone. No frame or native startup metric.

## Blockers / not accepted
Actual local isolated Hono+PG+Redis HTTP stand started with 120 synthetic chat messages and 65 users. Login 200 but Python cookie-mode follow-up 401; did not bypass auth or alter security. Existing Chrome extension quarantined BROWSER_ACTION_OUTCOME_UNKNOWN; browser_tabs retry failed, shared hub not restarted with other agents active. No actual browser cold/hot first entry, INP/scroll or real route network bytes, broker reconnect, gallery network download, Admin server pagination/permissions/form end-to-end or Trainer live browser editor proof. No native simulator frame/interaction results. Do not mark stage 11 completely accepted; physical scenarios alone owner-accepted. Stand stopped. No other domains changed.
