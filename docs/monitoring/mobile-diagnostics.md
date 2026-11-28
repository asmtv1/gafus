# Mobile diagnostic pipeline

## Protocol and deployment

The existing V1 transport is extended with optional diagnostic fields. Deploy the
updated API and Worker before any mobile OTA carrying this contract. Old event
producers remain supported. Native compatibility and OTA fingerprint checks are
unchanged; no new native library is required.

The reporter selects codes and source metadata from the static catalogue. Run
`pnpm check:mobile-diagnostic-catalog` after changes to reporter call sites.
To register new sources, review and run
`node scripts/check-mobile-diagnostic-catalog.cjs --write`. Existing source
metadata must remain stable for old installed bundles. A changed source should
have a new issueKey rather than silently reusing a published identity.

The API validates and sanitizes all optional context before durable spool storage.
The Worker independently validates events again before OTLP export. Installation
IDs are random diagnostic pseudonyms, unrelated to account, device hardware, or
OTA authorization IDs. They and session IDs belong in logs, not metric labels.
Navigation breadcrumbs are bounded and use only allowlisted route templates.
Never report account data, tokens, bodies, dynamic paths or raw URL parameters.

## Incident investigation

Search Uptrace logs by mobile service and error code. Use
`gafus.error_fingerprint` to distinguish failure groups, and filter by release
identity, build, update ID and environment. A verified registry match adds the
OTA revision/source SHA; an unmatched ID is unknown, not the latest active OTA.
For an HTTP failure, use the actual server trace ID when present. A missing trace
can mean a gateway/network failure or an unsampled server trace.

Stack statuses distinguish unavailable and sanitized-empty stacks from captured
frames. Unknown codes include a stack-derived grouping component, which can
change between builds. The raw normalized bundle stack remains available when
a separate symbolicated stack is exported.

## Private symbolication

The existing OTA publisher produces the private Hermes map archive. The Worker
can read it only when the following runtime configuration is deliberately enabled:

- GAFUS_MOBILE_SYMBOLS_READ_ENABLED=true
- GAFUS_MOBILE_SYMBOLS_READ_ACCESS_KEY
- GAFUS_MOBILE_SYMBOLS_READ_SECRET_KEY

Use a dedicated read-only credential restricted to the private symbols bucket.
Never reuse CI upload credentials or expose the bucket publicly. The feature
defaults off. The manifest hash must match the registry symbols reference;
environment, platform, runtime, update ID, revision and source SHA must all
match, as must the map hash. A single decoded map is cached; cache misses per
drain tick and downloads are bounded. Multiple maps are not guessed. If
resolution fails, the normalized stack is still exported.

Before production enablement, confirm real Hermes offsets on each supported
platform and verify access to existing OTA map archives.

## Queue and quality

The existing local durable queue prefers fatal/error events over lower priority
items. Invalid batches are split to isolate bad events; persistent invalid
singleton events are eventually dropped. The server still uses its existing
quota, deduplication, lease and retention policies. No database migration is
required by these additional event fields.

The session_start event counts observed JS runtime sessions, not all native app
launches. Do not present a native crash-free rate from this denominator.
Installation/session counts are approximate and should not identify users.

## Verification and rollout gates

- `pnpm check:mobile-diagnostic-catalog`
- `pnpm test:mobile-diagnostics`
- Full workspace build/typecheck and existing API/Worker/mobile tests.
- Verify server-first backward compatibility, real Postgres ingest and Uptrace.
- Verify private maps with actual release Hermes stacks on iOS and Android.
- Verify representative offline, relaunch, navigation, HTTP and OTA error flows.
- Test signed OTA with testers before any mandatory mass rollout.
- Review existing Uptrace dashboards and configure live grouping/alert rules
  only after actual ingestion/series have been confirmed.

The focused source-level tests mock platform, storage and transport boundaries;
they do not replace a production integration test or physical-device validation.

## Mobile Health dashboard and publication review

The production dashboard is https://app.uptrace.dev/metrics/9378/55388.
Its source is `ci-cd/observability/uptrace/gafus-mobile-health.v2.yml`.
On initial import, Uptrace displayed only the two existing delivery widgets;
review/re-import the remaining widgets after the new series are received.
The three candidate monitors in the template remain paused and were not
created on production; activate only after verifying series and thresholds.

Unsent matching nonfatal errors can be coalesced for 30 seconds, preserving
occurrences; dispatched event IDs are immutable. Sampled performance histograms
cover JS startup, auth restore, API groups and OTA operations; these do not
measure native cold/warm launch. After successful export the spool retains only
minimal cohort metadata for 24 hours, then a deduplication tombstone.
The admin panel uses verified-release 24-hour cohorts and flags insufficient
observations as such, not as evidence of a healthy release.

Production investigation on 2026-11-27 confirmed that update ID
`cdf49fe7-da78-44ab-bc61-bc8a7ffdcc2e` belongs to the verified iOS 1.7.5
build 101 embedded bundle, not a standalone OTA release.

## Local verification, 2026-11-27

- The catalog gate checks reporter aliases and rejects direct transport bypasses;
  the catch ratchet inventories catch handlers and preserves existing unreviewed
  handlers by fingerprint. Existing baseline entries are not evidence of a
  completed semantic review. New exceptions need an explicit rationale.
- The durable queue filters incompatible native build/runtime scopes before
  transmission, preserves same-scope OTA history, and does not overwrite the
  stored queue after a failed read. Health events report bounded loss, storage,
  delivery and queue-age counters without recursively reporting their failures.
  Random installation identifiers rotate on JS startup after 30 days.
- HTTP attempts carry independent traceparent values; these are untrusted links
  on the server, not authorization or parent context. A timeout can be linked
  without a server response. Image, CDN fallback, video first-frame and screen
  commit measurements are sampled JS metrics, not native launch or complete
  screen data-readiness measurements.
- Multiple Hermes maps require an exact recognized bundle identity. An embedded
  archive uses revision zero and a verified native artifact SHA plus the native
  build and embedded update ID; ambiguous matches are rejected. Native build
  archival and private bucket access still need operational verification.
- Local Expo export of runtime 1.7.6 produced Hermes bytecode and composed
  maps for both platforms. The real map offset regression (see
  scripts/qa/check-mobile-hermes-export.cjs) resolved reporter source positions
  on each platform. This is a real map test with a constructed stack, not an
  exception captured from a running installed production app.
- The queue stress test exercises 1,000 events, retains 500 including all ten
  fatal entries, and enforces the batch limit. This is a desktop test, not a
  low-end-device performance benchmark.
- Native inputs and lockfile are unchanged relative to the local checkpoint;
  this is not proof of compatibility with an earlier store binary. The local
  iOS simulator contains 1.7.5 build 100, and the Android AVD lacks its SDK
  emulator binary and system image. Do not waive runtime or signature checks.

## Local follow-up: functional coverage and alert candidates

- The catch ratchet now requires the expected-fallback rationale to appear at the
  beginning of the **same** handler. Nested comments cannot waive an outer
  catch. Use `node scripts/check-mobile-diagnostic-catches.cjs --inventory`
  to see exact outstanding handlers and `--require-zero` for the final
  semantic-review gate. Do not regenerate the baseline just to admit a new
  unreviewed catch.
- Diagnostic coverage was extended to pending training timer reads,
  gallery physical cache cleanup, registration promo requests, playback
  preference persistence and intro-state restoration. Chat refresh, send and
  realtime failures preserve the original exception instead of a synthetic
  stack. No user payloads are added.
- Sampled performance histograms now include training days/steps request
  duration, first/next feed page, chat room synchronization, message send,
  connection-grant request, initial successful room subscription, photo/video
  feed upload attempts and a foreground JS timer-delay proxy. These are
  operation-attempt measurements, not all successful outcomes or native launch
  duration; they do not measure complete UI data readiness.
- Functional alert candidates use a fixed-cardinality exported-occurrence
  counter by platform and diagnostic domain, with separate startup and native
  failure groups. The existing OTA rolling event gauge has no environment label
  and its dashboard query must not filter by one. Candidate thresholds are
  provisional and the monitors remain paused; exported occurrence rate alone
  is not a per-release affected-installation rate.
- The native verification helper accepts an optional private symbol directory.
  It checks exact build, artifact SHA, embedded update ID, source SHA,
  platform/environment/runtime, map integrity and immutable delivery receipt
  before emitting `embeddedSymbolsRef`. Use maps captured by the original
  native build job; an independent export is not proof of matching native
  bundle provenance. Previously distributed builds still require their actual
  archived maps and an approved registration/backfill procedure.

## Completed catch review and screen data readiness

The remaining 168 baseline handlers were explicitly reviewed: 35 now report
through the static catalogue and 133 retain narrowly documented intentional
fallbacks (including validation, owner fences, typed uncertain purchase outcomes,
cleanup, existing error propagation and QA-only diagnostics). The baseline is
empty. Both the dedicated check and the architecture gate now require zero
unreviewed handlers. Google Play cancellation remains a normal outcome.

The existing SCREEN_READY measure is a navigation/first-frame proxy. New
SCREEN_*_DATA_READY metrics measure a foreground focus/foreground-resume or
locally scoped dataset entry until the screen has committed its successful
primary data state and two animation-frame opportunities have elapsed.
They cover 22 screen/data variants: catalog and favorites, protected days and
public paid preview, steps and daily course, feed and post detail, chat list
and room/history, pets, profile (role-specific notes/courses), gallery albums
and photos, question list and discussion, article list and detail,
consultations, achievements, reminders and guides. A successfully read empty
list is valid; initial loading, error states and unconfirmed private data are
not successes. Pagination failures do not invalidate a usable first page
where that matches the rendered UI. A focused comment is required for a
deep-linked feed discussion.

The tracker cancels on blur, background, scope replacement and unmount;
polling/refetch does not duplicate a completed sample. Cached successful
content is measurable on re-entry. Local scope identifiers are not exported.
The fixed allowlist uses the existing bounded sampled histograms; Uptrace can
filter by operation and platform and display p50/p95/p99. These are JS
content-commit/presentation proxies, not exact GPU paint, full media decode,
native cold launch, or proof that every optional panel is network-idle.
No new native module is required. Physical device comparison remains a
rollout gate.

## Next store binaries: OS diagnostics and native symbol retention

Store versions now include the autolinked `GafusNativeDiagnostics` module.
Expo Observe continues to own native crash capture. Android API 30+ reads
only main-process OS-confirmed ANR and low-memory exits after the current
package install/update time. iOS MetricKit collects version-fenced hang
diagnostics and aggregated memory/watchdog exit counts; these are delayed OS
reports, not real-time crash detection or a claim that every OOM is observable.
Mixed-version iOS metric payloads and unknown build metadata are discarded.
Raw OS descriptions, trace files, memory dumps, PIDs, user content and
hardware identifiers are not transferred. Historical reports use a stable
deduplicating event ID, native release metadata, `updateId: unknown` and
an independent synthetic app-start identifier. They must not enter the
current JS-session error denominator. Native records are acknowledged only
after durable JS queue write. API 29 and earlier cannot provide this Android
exit source. iOS MetricKit delivery is not guaranteed for every event.

Production Expo Observe startup gauges now become bounded performance
histograms in the durable telemetry spool; Alloy remains the metrics exporter.
The preview direct metrics canary is unchanged. The release gate, approved
native ingress, quota and strict startup allowlist remain enforced. SDK
point-session identities are used solely for replay deduplication, not exported.
Native cold/warm launch, launch, TTI/TTR, bundle/load timings are distinct from
JS startup measurements. These changes require deployment of API/Worker before
the new store builds.

### Private build artifacts

The local store IPA and AAB wrappers create a fresh private EAS capture
workspace and require a diagnostic archive before declaring build success.
Xcode's React Native build phase emits a composed Hermes map and checksums of
the final JS bundle and map; the archive step compares the bundle from the
signed IPA, then finds the matching Xcode archive by actual Mach-O UUID and
bundle hash. All matching archive dSYMs are retained. Android uses the
release Gradle-generated map paired with the exact signed bundle, and extracts
the authoritative R8 map from the AAB. Artifacts are retained privately under
`~/Library/Application Support/GAFUS/NativeDiagnostics`, outside Git,
with signed artifact SHA-256, embedded update ID, native build, source SHA and
symbol checksums. The temporary EAS working directory (which can contain
signing material) is removed by the wrapper. Missing or mismatched symbols
fail the build gate instead of using a fresh independent export. The
private Hermes archive can use the existing CI-only S3 uploader and verified
delivery receipt. Native dSYM/R8 are local archives for offline analysis;
automatic server-side native symbolication is not implemented by that uploader.
The standalone APK build path still needs separate R8 provenance integration;
the registered AAB store workflow is the current automated Android gate.
No store upload or actual signed build was performed by this code-only pass.

Before production rollout: verify compiled native modules in signed IPA/AAB,
test real OS ANR/hang/memory evidence, verify actual EAS capture paths, upload
private Hermes maps in an approved job and register the exact delivery receipt.
Update store privacy/data-safety declarations as appropriate. Confirm
production native ingest and the existing private symbol reader are enabled
with approved credentials, then validate Uptrace with real release data.
