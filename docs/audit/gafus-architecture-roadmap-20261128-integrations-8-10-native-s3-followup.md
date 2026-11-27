# QA follow-up: stages 8 and 10 — archived signed binaries and local S3

Base: 01c48fbe8fe1eb922ce7bce865946e5d1f049a9e on qa/integrations-6-8-10-20261128. Companion report: gafus-architecture-roadmap-20261128-integrations-6-8-10.md. Same isolated worktree. The earlier 289 tests were not repeated. All artifact operations are read-only, temporary extracts and exact historical Git blob materializations only. No device access, build of a new mobile binary, publication, production credentials, provider callbacks, live purge or production mutations. GitHub read-only archive inventory used existing repository access.

## Exact source inventory

Recovery root: `~/Documents/GAFUS-pre-refactor-20261126/`. All binary files below are under its `release-recovery/` subdirectory, unless specified. All historical Git commits are present in the local repository object store. No archive changed. Native metadata checked using the current `apps/mobile/scripts/verify-native-ota-artifact.py --descriptor <actual archive descriptor>`. Each APK signature checked using Android SDK build-tools 36.1.0 apksigner; AAB using jarsigner and keytool; IPA using the штатный native-ios-store-artifact.mjs verifyIpa and codesign.

| Store / version / build | Archive filename | SHA-256 | Descriptor source |
|---|---|---|---|
| iOS App Store 1.7.5 101 | gafus-1.7.5.ipa | af7c70284c21dbafbe5d813042df0798d9afdf91a5e8d181aef70265f222970f | temp-evidence/gafus-native101-verified-descriptor.json; later temp-evidence/smart-ota/ios101-registered.json |
| RuStore 1.7.5 17506 | gafus-1.7.5-17506-rustore-signed-ota.apk | 2cf87e13003cd9eb430e87db72d09ab9ed8e35fef7f4a2cf752b2083c2352e19 | temp-evidence/gafus-rustore-17506-full-native.json; later temp-evidence/smart-ota/android-registered.json |
| RuStore 1.7.5 17507 | gafus-1.7.5-17507-rustore-signed.apk | a7f21b3856d2ea3f6613cf86d28334f44094fda2c5ef2e801010104c93942fe7 | release-recovery/.ota-certs/rustore-17507-native.json |
| Google Play 1.7.6 17601 | gafus-1.7.6-17601-google-play.aab | 6ff07632fa4427f50be878016b261da08dc77d11867ece05b63dc887c4dcb031 | ~/Desktop/gafus-refactor/apps/mobile/.ota-certs/android-store-native.json (read-only) |
| Google Play 1.7.6 17603 | gafus-1.7.6-17603-google-play.aab | 837793b3f1aba2b9ab28f261ae983abfaf4e803be31a8606661df99b199c72af | release-recovery/.ota-certs/google-play-17603-native.json |
| Duplicate 17603 | app-release.aab | 837793b3f1aba2b9ab28f261ae983abfaf4e803be31a8606661df99b199c72af | identical to 17603; not a separate release |
| Google Play 1.7.6 17602 | NOT FOUND | — | temp-evidence/gafus-17602-native-candidate.json (registration candidate, not binary proof) |

All six file invocations of Python native verifier returned 0, including duplicate. All five unique native binaries' exact historical source fingerprints match descriptor. IPA full verifier passed code signature and App Store provisioning; archive SHA and embedded ID also match temp-evidence/gafus-native101-verify-request.json. Two APKs verified v2/v3, one signer each, SHA and embedded ID match temp-evidence/gafus-rustore-17506-proof.json and temp-evidence/gafus-17507-native-verify.json. All Android archives have signer certificate SHA-256 4ab516cf4fe26131a714d08486aa6c2b10701e8d4bbd20b3043d6499c040d8f9. AAB jarsigner returned 0 and 'jar verified' for 17601/17603 (and duplicate); warnings include self-signed certificate, untrusted PKIX chain, no timestamp and JarFile/JarInputStream inconsistency. This verifies local upload archive signatures; it does not certify Play distribution signing or store acceptance. IPA Team ID PJQ8PP666S; codesign --verify --deep --strict returned 0. Pinned OTA certificate SHA-256 for each descriptor: 58859944bd6e3837b579ede3b5bcb2197db31dcbbae0d3264196fd88b3c667ca.

| Build | Native source SHA | Recomputed fingerprint | Embedded update ID |
|---|---|---|---|
| 101 | f6e6994e1167e9dbdf4c9ab13bbfbcaa7168c9d2 | 284430e1d2a1a137be0a456b69731c40c1a266d608669c7b00e2d34b1f5150f1 | cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e |
| 17506 | 74dcabbb47b6c563f27f30668e3db6140599fc7e | d9ecf3c85ef20fc7382c2a68809af7e2a64465ae35ab6151874386005ce7aed0 | 2c4249c6-d204-44ea-8149-a7d67714b6f1 |
| 17507 | 3d57cf0963b9351dd241dd28eed5d0c92c0e7369 | 664004b78b828b4e155c3defd1f0f18498c80648b72e1013f3323bba1ac49b7b | d0d4015c-8191-487c-ba06-01c24c1eb812 |
| 17601 | 28e3f9bf7c08cb348baed4aab221e7b5cbd9b5d9 | 98efbbfbd0c2bb8652fa946a5763c30f3a5444440e8f49af04b4901c61eaee05 | 482cb7f5-7d49-4cd0-beeb-bf74a494d117 |
| 17602 candidate only | 4ff327cb597355eea729cea63873314b0b41efe4 | dac5b9e8e41b5f9127614a87b25058190702801f69fdc332aa6a114ad10a824d | unavailable |
| 17603 | db6a46fc4878278a7a339c039559ee92d5482507 | 90cb6f8cddeca90458de7cde6318207245dd6131bac1f830ecdd011fce1689fa | e5f048dc-f87e-46e4-bfa4-af95ecdf258f |

Method: git ls-tree -r on each immutable SHA, git archive selected exact historical paths (pnpm-lock.yaml, mobile native config, plugins/modules/native directories and historical fingerprint script; excludes generated dirs as per verifier), index in separate temporary git tree, invoke historical native-source-fingerprint.mjs on materialized tree and descriptor. No dependency installation in historical tree. For 17602 initial candidate lacked certificateSha256; derive it from the candidate's matching pinned public certificate in a temporary profile only, then invoke verifier. It matches candidate fingerprint but is NOT a registry attestation. Two early harness attempts failed due /tmp symlink vs CLI main guard and duplicate CLI output, corrected by physical /private/tmp and direct CLI; five binary source checks and separate 17602 candidate check are green.

17602 search: filesystem inventory covered Desktop, Downloads, Documents, .app-store, .expo, .cache, Xcode Archives, /private/tmp, /Volumes (skipping dependency/build caches and symlinks), plus Spotlight filename query. Historical temp-evidence contains candidate and a local build Gradle config filename, not the binary; no signing config contents read. gh run list --repo asmtv1/gafus --commit 4ff327cb597355eea729cea63873314b0b41efe4 returned empty. Full paginated Actions artifacts query matched no exact source SHA or relevant signed AAB; two incidental names matched, not native builds. Missing access boundary: original signed upload archive from Play Console App Bundle Explorer, versionCode 17602, or a read-only copy from original build storage. No production Play Console session or credentials used. 17601 and 17603 cannot substitute for 17602.

## Exact OTA manifest and archived trust

Archive sources: temp-evidence/gafus-cdn-ota-final-manifests-20261125.json, temp-evidence/gafus-cdn-ota-verified-manifests-20261125.json; and temp-evidence/gafus-ota-diagnostic-manifest.json + gafus-ota-diagnostic-headers + gafus-ota-ios101-public.hbc. The first two include one duplicate Android rev9. Archived older native descriptors are verified=false; later authentic archive registry snapshots smart-ota/{ios101-registered,android-registered}.json and registry-native.jsonl contain verified=true with identical identity/fingerprint and actual embedded IDs. The штатный verifyProductionNativeTrust succeeds on both later snapshots; no data modified. Not a live registry query.

Run:
```sh
node scripts/qa/verify-archived-ota-manifests.mjs "$HOME/Documents/GAFUS-pre-refactor-20261126"
```

The new read-only harness invokes existing pinned trust and certificate verifiers, checks detached RSA-SHA256 signature on original decoded bytes, IDs, runtime, channel, environment, source SHA, revision, native publication ID/fingerprint, embedded ID extracted from binary, approved S3 origin/path, archived receipt hashes and recovery constraints. PostgreSQL base64 wrapping normalized without changing decoded bytes. No CI checks/symbol receipts fabricated. Full CI registration validator requires genuine CI checks and symbols receipt not contained in these archive records; no actual registration executed.

| Platform/build | Revision | Update ID | Manifest SHA-256 | Evidence |
|---|---:|---|---|---|
| iOS 101 | 1 | 1dca1858-fb0f-4258-bc46-5c4afc77daf0 | e464e0ae2c87d77f432337f0f19c8c5979dc242eaf83d076b863543ea0ddc5ca | actual archived HBC matches launch hash b0eec222f8ae69c60513e7e3dad344ec9c3098764aba78fceed76e4ada7b269c (8526392 bytes) |
| iOS 101 | 14 | 549f3742-696e-4598-be9b-dfeafa2dbfa3 | f406f2778d31043c333831a2d32792b7c5bcfc973c0892789e0c884c8f0ff720 | 116 archived asset receipts; recovery 11 |
| iOS 101 | 15 | 5c463443-3469-4360-9fb4-2cddd560ac2e | 34d649fc78520458e3959a9846c45a0e2ca6bd5c514076b97e1b11f0baf69a82 | 117 archived asset receipts |
| iOS 101 | 16 | 6261dfc5-b729-45b9-80f5-4c1312c9acaf | 7581a9f4892b3449ab50aede8121c4a07f46ed8433e17b827b3ac05f0b78efc6 | 116 archived asset receipts; recovery 15 |
| RuStore 17506 | 8 | 4aa543d2-b129-42f6-a436-b8efb5878a54 | e882b11ed7ea196713f45c2c0f6219424aa270ffa8c119be43e3ef7a20d37496 | 119 archived asset receipts; recovery 5 |
| RuStore 17506 | 9 | 9cc86286-de94-4f75-8494-010dd30ed30c | 17e5192967060d460b07802698af5deaaef2e85a83c73e5183e2aaef0a2f54b2 | 120 archived asset receipts |
| RuStore 17506 | 10 | 68f06346-62e1-4c01-9f3d-42923e139320 | b3e60213c26f9ba4005bcd69c389ca9431e2d68a43d6c3f360ab59a0bae7627d | 119 archived asset receipts; recovery 9 |

7 unique archived signatures PASS (8 observations including duplicate). Actual local HBC readback only for iOS rev1; other asset receipt checks compare archival inventory to signed hashes, no live object reads. Three distinct manifest source SHA fingerprint recomputations for 25 Nov: android 790c8bb50d52a45dae5db1138d220f854872a904, android 02b15a74e4e4b884e2cf9cd3ef61c29c91f167eb and ios 9a95425fa51c9cc748ce72020aa173fe9286ecf6 MATCH exact native release fingerprints. The iOS rev1 source SHA was not included in that separate recomputation.

No signed linked OTA manifest for 17507 / 17601 / 17602 / 17603 found in archived structured records searched; dispatch requests alone are not signed bytes. Missing original signed manifest/receipt linked to each exact native ID/runtime and verified registry export for these builds. Do not publish new packages to fill evidence. Live registry state, live S3 receipt/readback and fresh CDN purge remain open. No physical tests requested.

## Reproduction and local receipts

```sh
R="$HOME/Documents/GAFUS-pre-refactor-20261126/release-recovery"
E="$HOME/Documents/GAFUS-pre-refactor-20261126/temp-evidence"
python3 apps/mobile/scripts/verify-native-ota-artifact.py "$R/gafus-1.7.5.ipa" --descriptor "$E/smart-ota/ios101-registered.json"
python3 apps/mobile/scripts/verify-native-ota-artifact.py "$R/gafus-1.7.5-17506-rustore-signed-ota.apk" --descriptor "$E/smart-ota/android-registered.json"
python3 apps/mobile/scripts/verify-native-ota-artifact.py "$R/gafus-1.7.5-17507-rustore-signed.apk" --descriptor "$R/.ota-certs/rustore-17507-native.json"
python3 apps/mobile/scripts/verify-native-ota-artifact.py "$R/gafus-1.7.6-17601-google-play.aab" --descriptor "$HOME/Desktop/gafus-refactor/apps/mobile/.ota-certs/android-store-native.json"
python3 apps/mobile/scripts/verify-native-ota-artifact.py "$R/gafus-1.7.6-17603-google-play.aab" --descriptor "$R/.ota-certs/google-play-17603-native.json"
node --input-type=module -e 'import fs from "node:fs";import {verifyIpa} from "./apps/mobile/scripts/native-ios-store-artifact.mjs";const [ipa,d]=process.argv.slice(1);console.log(verifyIpa(ipa,JSON.parse(fs.readFileSync(d))))' "$R/gafus-1.7.5.ipa" "$E/smart-ota/ios101-registered.json"
"$HOME/Library/Android/sdk/build-tools/36.1.0/apksigner" verify --verbose --print-certs "$R/gafus-1.7.5-17506-rustore-signed-ota.apk"
"$HOME/Library/Android/sdk/build-tools/36.1.0/apksigner" verify --verbose --print-certs "$R/gafus-1.7.5-17507-rustore-signed.apk"
jarsigner -verify "$R/gafus-1.7.6-17601-google-play.aab"
jarsigner -verify "$R/gafus-1.7.6-17603-google-play.aab"
node scripts/qa/verify-archived-ota-manifests.mjs "$HOME/Documents/GAFUS-pre-refactor-20261126"
```

Final native trust verifier: two later archived registered descriptors PASS; 17507, 17601 and 17603 explicitly BLOCKED on archived verified=false (other-native-trust.log). GitHub Releases paginated native asset search returned no result; Spotlight query returned no 17602 AAB. Local source fingerprints of OTA rev14/15/16 iOS and rev8/9/10 Android are confirmed. Store upload/distribution/registry/OTA publication not inferred from any local artifact.

Terminal1 durable IDs: inventory 6ccf94c4730449e8fc0375bb6e104482f089be058fd3b635; binary verification 0a21a4726506749d6b1b8ea80fc80281465b6cbf3c99783f; full IPA verifier 4fee05607ed882bb9699f709406c719c494619c02d84bdb4; historical binary fingerprint batch f221ab0b0fa11db12051eec8381897f4af2071e380a93cd1 (5 matches + missing candidate hash field, nonzero); candidate fingerprint retry 3532d1c4f68cd30c3935e3e90a958533b4125929e7fbb0e1 (exit 0); OTA-source fingerprints 0c314fa4a396c1b0f74c3b53a3bdc26bbdd823ef25d85178 (exit 0); GitHub inventory 42ba63050d9e2a08e17591416be5aa1b81002d8a754a7145 (exit 0).

Log SHA-256 (local receipts, not raw manifests):
```text
cff0851d3797ea71d578ce0320e35ca789b2bd228e55cbc6e774d82ad4ccc7b0  native-archive-inventory.log
40c1c7b7d497437afa6ada5e6e69eeda6e436f93b0dfc5886d01ec00b279ebcf  native-real-verification.log
e60a47f20e4020f79dad875035fb84d5917babe90288cc51f7e5ca19b3f2b20c  ipa-store-verifier.log
35d2bda46e229f5e70897f625cfec6605fdda9d4d35dc87e1faa3314724cd3a1  native-historical-fingerprints-final.log
4a7aa45a82d8905a2598eea7e94551581cf85d55fd38681bba196e0b6595d72a  native-17602-candidate-fingerprint.log
799d789e684d7009cd932becaca6b34a01a8d20be808227748e778ecf192f001  native-github-inventory.log
a09d614ab4a2aa16c803d9d90e1a9cf2b58143644a373e2ee8da1639ee2960d8  native-github-artifacts-all.log
86d508f29b3fce9ec6cea4b866d6b348d6df553c138a1cdfa6bbb5d9c1b4a8e8  native-release-asset-search.log
dee33f11311a1ccc59dfc99b32a2475fec3c1c05a4f1a0bdbf700f03fbbbd0bf  archived-ota-manifests-final.log
ed5b527b0a0888f876eabd60d5d7bb62e8ec0a8f9fff82d723a9fffd3389550d  ota-manifest-source-fingerprints.log
1eacb51b88096ac4aab808195bcb6f173573620c4c54c7ffbc4a9009d1ce7d02  other-native-trust.log
```

## Stage 8: real local S3 — PASS

Official pinned MinIO source was available: github.com/minio/minio commit 7aac2a2c5b7c882e68c1ce017d8256be2feea27f, Go module v0.0.0-20260212201848-7aac2a2c5b7c, verified Go module checksum h1:/qdoYujxF5MBLDMVLeiYJ/7fBa1HikX39Dvzb9Ji8pA=. Downloaded via https://proxy.golang.org with GOSUMDB=sum.golang.org and no private module exclusions or fallback. Built using go1.26.5 darwin/arm64. Binary is in own ignored .gafus-refactoring/architecture-qa-20261103-local/bin/minio; SHA-256 4b79cd8ace58747bd0f25a83ecf4659e2b83665f2c5c5e0b1867a2d2ad89c59b. First install timed out after 1200 seconds during compilation (job 8abbd454d0cc5dadc2399acc06d19bac8ce73beb99be565d); offline cache retry was blocked by Go's module deprecation metadata lookup (job 816dfe3e933e76391158b80e2261dbd9e0de0cd76754c9dd). Final official-proxy retry reused the compiler cache and completed both install and S3 profile with exit 0, timed_out=false (job c6778388325b4757e1c73daedbf8c810d8147af2a1c431b5). No pin or QA safety guard changed.

```sh
BASE="$PWD/.gafus-refactoring/architecture-qa-20261103-local"
mkdir -p "$BASE/bin"
env -i HOME="$HOME" PATH="$PATH" TMPDIR=/tmp GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org GONOSUMDB= GONOPROXY= GOPRIVATE= GOENV=off GOTOOLCHAIN=local GOBIN="$BASE/bin" GOMAXPROCS=2 go install -p 2 github.com/minio/minio@v0.0.0-20260212201848-7aac2a2c5b7c
go version -m "$BASE/bin/minio"
env -i HOME="$HOME" PATH="$PATH" TMPDIR=/tmp node ci-cd/scripts/local-minio-real-s3.acceptance.mjs "$BASE/bin/minio"
```

Profile uses loopback-only disposable MinIO, generated temporary credentials and unique synthetic bucket/objects; original provider credentials never loaded. Exact successful output:

```text
PASS REAL GAFUS GalleryObjectStore + MinIO: conditional create, HEAD, read ETag, identical retry, foreign conflict, delete
PASS REAL MINIO anonymous 403 / signed HEAD 200 / Range 206,416 / tamper 403 / expiry 403
PASS REAL MinIO 206+403 across simulated CDN 410/503 policy and 403/404 fail-closed cooldown
PASS REAL MINIO process outage -> recovery, existing object and valid SigV4 survive restart
PASS REAL MINIO signed GET after object deletion -> 404; 410 is CDN/application policy, not MinIO
```

Limits: real local S3 protocol, object deletion/revocation and restart are now verified. CDN 410/503 are simulated by existing profile, not real CDN purge; no Cloud.ru or live provider mutations. External callbacks and live purge remain open exactly as requested.

MinIO log checksums:
```text
83e4d5383e023e07abefeb2065556aea246ce518477441d58cda97c55b7dc3ea  minio-pinned-install.log
057f3591d0591e7faa35eb70bc96f2239d654b3055e48b3993d3b1113dbed350  minio-pinned-retry.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  minio-pinned-proxy-retry.log
7f83b092ad7e5c9a8f9ba7409d1abefff4969e09519f947c065763c2348ac22e  minio-real-s3.log
```

## Final acceptance

- Stage 8: real local S3 PASS; external provider purge and fresh cloud-side revoke/readback still BLOCKED pending sandbox and scoped permissions.
- Stage 10: five unique native binaries metadata/signature/source fingerprint PASS (AAB signature warnings explicitly recorded); seven archived OTA manifests signature/link PASS; two archived verified registry trust checks PASS; missing 17602 AAB and linked signed manifests/verified registry for other three binaries remain BLOCKED. Physical devices not repeated.
- No rerun of prior 289 tests. No push or merge. No production changes.
