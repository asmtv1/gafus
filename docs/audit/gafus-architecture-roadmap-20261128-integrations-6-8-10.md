# QA: этапы 6, 8, 10 — интеграции (2026-11-28)

Статус: локальные целевые прогоны PASS, внешние sandbox gates PARTIAL/BLOCKED. Не считать полным закрытием этапов. Физические устройства исключены по решению владельца.

## Provenance / isolation

- Plan: docs/audit/gafus-architecture-roadmap-20261126.md; follow-up: docs/audit/gafus-architecture-roadmap-20261128-local-followup.md.
- Base: qa/architecture-acceptance-20261127 @ 850874bf306d6aa96629e704ca256033ef1d99f2.
- Own branch: qa/integrations-6-8-10-20261128; worktree: ~/Desktop/gafus-qa-integrations-20261128.
- Changes: be73f6ad3c2c17dc70d7224e9992bed6b76e4dd2 (OTA tests and .easignore).
- Local Terminal1 only; no deployment, production mutation, real payments, publication, push or merge. Existing dirty worktrees left intact. PG fixtures synthetic, dedicated ephemeral databases; no real provider credentials used.
- pnpm install --offline --frozen-lockfile --ignore-scripts, then Prisma client generation. Initial OTA test attempt overlapped install; initial four PG attempts failed on missing compiled @gafus/prisma entrypoint. These are setup failures, not final passes. To avoid rebuilding concurrent agents' work, copied (not symlinked) 59 packages/*/dist from the existing QA tree at the same HEAD; verified its packages tracked status clean and no non-test changes under packages between c8fba58c4 and base. Fresh Prisma client in this worktree. This is not independent clean compilation of all packages.

## Final executable receipts

All rows below completed with exit code 0. 289 passed; 7 skipped diagnostics in OTA PG profile (not counted as pass). 10 live CDN observations are separate.

| Profile | Pass | Skip | Local log |
|---|---:|---:|---|
| payment-archqa-isolated-pg | 31 (17+10+4) | 0 | payment-retest.log |
| google-play-isolated-pg | 3 | 0 | google-pg-retest.log |
| media-cdn-purge-isolated-pg | 8 | 0 | media-retest.log |
| ota-version-publication-isolated-pg | 30 | 7 | ota-pg-retest.log |
| OTA Node contracts | 89 | 0 | ota-node-retest.log |
| OTA mounted / policy / progress | 46 | 0 | ota-mounted.log |
| API providers / manifest / media HTTP | 49 | 0 | api-provider-manifest.log |
| Resend and webhook | 15 | 0 | mailer-provider.log |
| Media contracts and HTTP range recovery | 9 | 0 | media-contract.log |
| Native artifact verifier Python | 9 | 0 | native-verifier.log |
| Real CDN read-only canaries | 10/10 | — | cdn-readonly.log |

Logs: .qa/testing/integrations-20261128/ (ignored; local). Terminal1 durable job IDs: payment 49457f4c207902e86a8f88cdea52b4a772f22357c4969984; Google 1246ddeea47bf1a590a8a5e6f373ebc8d33a8bb8f01fbdfa; purge 5aba7d116db5de6dd603d838568371b7386cb29dbc6478f1; OTA PG 7f0a140abefcabb15505dd765dae4df44e5dc96fdb6e006b; OTA node 65e953b56a5d84888de82526b4ac0c2801584fc3df1ef82a; focused group 61b5d776533a2585ee783cec456129031e9d9e0f15b3be14; CDN ccff523e12ce9df72b3eabfa0a0f44dbfb2f33d637c22f3c.

Reproduce from own worktree with installed dependencies, generated Prisma client and built workspace dependencies; PG scripts self-isolate. Use test fixtures only.

```sh
bash scripts/qa/payment-archqa-isolated-pg.sh
bash scripts/qa/google-play-isolated-pg.sh
bash scripts/qa/media-cdn-purge-isolated-pg.sh
bash scripts/qa/ota-version-publication-isolated-pg.sh
node --test apps/mobile/scripts/{native-release-contract,native-release-target,native-source-fingerprint,ota-175-ios-store,ota-175-release-configuration,ota-payment-profile,ota-target,self-hosted-ota-artifact,self-hosted-ota-public-env,verify-expo-ota-code-signing-cert,verify-ota-preview-native-trust,verify-ota-preview-workflow,verify-ota-production-native-trust,verify-ota-production-workflow}.test.mjs apps/mobile/scripts/self-hosted-native-profile.test.cjs
pnpm --dir apps/mobile exec vitest run --config vitest.config.ts src/shared/components/RequiredOtaUpdateGate.mounted.test.tsx src/shared/components/RequiredOtaUpdateGate.layout.test.ts src/shared/lib/otaPolicy.test.ts src/shared/lib/ota/operationalSignals.test.ts src/shared/lib/ota/mandatoryPolicyQuery.test.ts src/shared/lib/otaDownloadSize.test.ts src/shared/lib/otaProgressPresentation.test.ts
pnpm --dir apps/api exec vitest run --config vitest.config.ts src/routes/v1/payment-provider-webhooks.test.ts src/routes/v1/google-play-notifications.test.ts src/modules/app-subscription/google-play-service.test.ts src/modules/mobile-ota/manifest-protocol.test.ts src/routes/v1/mobile-ota.actual-app-mounted.test.ts src/routes/v1/media-cdn-probe.real-http.test.ts
pnpm --dir packages/mailer exec vitest run --config vitest.config.ts src/resend.test.ts src/webhook.test.ts
pnpm --dir packages/core-client exec vitest run --config vitest.config.ts src/media-delivery/cdnContract.test.ts src/media-delivery/cdnRangeRecovery.http.test.ts
python3 apps/mobile/scripts/verify-native-ota-artifact.test.py
```

## Stage 6: payment and provider callbacks

Actual PostgreSQL: sequential/concurrent webhook replay, single grant and ledger event, retry after unsuccessful provider ACK, amount/owner rejection, partial/full refunds and out-of-order old-period events, trial card fingerprint uniqueness, Apple concurrent verified callback, Google token migration/binding and cancellation. Provider evidence is synthetic/mocked: no external financial request or real callback. Resend/webhook route contracts passed in focused run; no external delivery event. Additional finance/trial/offer standalone profiles and consultation email outbox were not rerun individually in this pass.

Open gates:
- YooKassa: verified test merchant (shop ID and scoped key), isolated QA callback target, synthetic test payment method; test event and repeated delivery/receipt.
- Apple: sandbox flag found in local config but no proven isolated endpoint/transaction. Need sandbox test notification target, sandbox signed JWS/transaction or test notification token plus delivery receipt.
- Google Play: licensed test account / test purchase token, QA Play Developer access and isolated RTDN Pub/Sub/OIDC callback target or signed event receipt. No production subscription.
- Resend: nonprod sender/key, approved test destination, isolated webhook endpoint and signing secret, actual delivery event and replay receipt.
- Browser workspace initially listed only local QA tabs; later list returned internal tool error. Did not restart shared browser/hub or use unclassified credentials.

## Stage 8: real CDN observations and purge

Read-only HTTPS to existing explicitly named synthetic canaries. Fixture inventory: ~/.gafus-shared-cdn-canaries-20261125/manifest-final.json, validated through readManifest from infra/cloudru/shared-yandex-cdn-readiness.mjs. Scope limited to keys matching cdn_canary / canary_20261125 / beget-smoke. Public GET/HEAD returned 200; expected lengths and SHA-256 matched 7/7; video Range bytes=0-15 returned 206, exact content range and bytes 4/4. Repeated GET matched SHA. Private unsigned GET 403 in 3/3. All seven public objects reported MISS for both requests: no warmed HIT established. Observations are not p95/performance acceptance. No CDN or S3 mutation performed.

| Object | Bytes | First GET ms |
|---|---:|---:|
| Feed image | 88 | 3568 |
| Feed 360 | 1980 | 2621 |
| Feed 720 | 2264 | 3898 |
| Chat image | 88 | 3605 |
| Chat 360 | 1980 | 3516 |
| Chat 720 | 2264 | 7881 |
| Questions | 88 | 3845 |

Purge worker SQL checks cover concurrent lease, failure recovery, durable operation ID and retry without second provider invocation. ACK is a synthetic response, not a live provider purge. Direct real S3 origin / signed URL expiry / actual revoke and repeated exact-path purge remain open. Existing local real-MinIO profile requires a verified source-built MinIO github.com/minio/minio v0.0.0-20260212201848-7aac2a2c5b7c in the own QA scope; not found in checked locations, no cached MinIO container image. Need that binary or explicitly authorized isolated bucket/endpoint, scoped credentials to read/create/delete only owned synthetic objects, scoped CDN purge access, terminal provider operation receipt, confirmed HIT before purge, repeated purge and readback after revoke. Do not use shared production resources for mutations.

## Stage 10: OTA

Fixed generated .easignore drift while retaining protections (including pycache); replaced stale hardcoded production runtime expectation in test with checkout package version and added Android/negative-runtime cases. Added mounted tests for interrupted fetch (no reload/attempt marker; remains blocked; manual retry works) and stale reloaded marker (no automatic reload loop; manual recovery works). Expo download and reload mocked; no native device assertion.

PG: signed fixture bytes, certificate/hash validation, exact runtime/pointers, staged rollout, STOP/RECOVER, mandatory restrictions, idempotent operation, tester access revocation. Node/Python: native release, profiles, fingerprint, signing cert, CI, signed asset/manifest validation. Current source app version 1.7.6 (Android versionCode 17602). Historical 1.7.5 targets are exercised as contracts, not confirmed archive metadata. Need exact archived signed IPA for iOS 1.7.5 (101), APK for RuStore 1.7.5 (17506), AAB for Google Play 1.7.6 (verify actual build number against release inventory), native descriptors, source SHA/fingerprint and signed manifest/asset receipts for those runtime/store identities. Do not publish or build a new store release to replace missing evidence. No physical verification requested.

Conclusion: all executed local final targeted tests passed; no real sandbox callback or external destructive media gate certified. The architecture plan remains PARTIAL for external integrations; no production changes.

## Log SHA-256 (local receipts)

```text
e7df74b55be6d5e2c24914b633ebe0f213c12742ff857e7a745fab0d69b0f390  payment-retest.log
a0bd12acb2df562e813614c8dcc45f40cbca172bedeb9b7ee87de4847704e73a  google-pg-retest.log
f4ff1c4e47ec01d094a306288e8e0c8c629730d890f978f8a65753b220c1bdfa  media-retest.log
9b8ce6270a8925d63c1cc0c2c6db6285bf5b984c00362795690cc7c724fcbcb7  ota-pg-retest.log
42529d4c87bb9d69a5143391830910b26c4692357a2429a958790ee38456eea3  ota-node-retest.log
56bf80585c5eef103b8eb5b03c4f84e05273a308929dd88ef084866042a49f41  ota-mounted.log
9f4137c4cce4c9392947924b5a2a16ace58ee2418a9b638258ea2c3bc20ebe25  api-provider-manifest.log
b05bd789538405b15c4e8368362503af637d295fb865338361693467b71b3596  mailer-provider.log
4852304455d9f50940e72665731bf1e0ffed99b7737b94e89063d1a0d571225d  media-contract.log
9a6edf8ef37706071598674e7255ea7542fa59703e7d9d8e750067baebe400c4  native-verifier.log
5e1a5461d9448e29975e2a5a5d2e41cc297136a19581d4052c5241911c816931  cdn-readonly.log
```
