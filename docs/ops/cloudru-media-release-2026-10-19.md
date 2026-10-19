# Cloud.ru media workers — release checklist (GAFUS Main)

Scope: Gallery, Feed Photo + Video, Questions, and matching GAFUS API / BullMQ
changes. This checklist does **not** authorize actions: no production
publication, S3 writes, Cloud.ru Job changes, push or deploy without approval.

## Pre-release gates

1. Confirm Git root `/Users/asmtv1/Desktop/gafus1`, branch `main`, and review
   every pre-existing unstaged change; don't clobber other work.
2. Verify `pnpm test:cloudru-media`, all feed/gallery/questions Vitest suites,
   Questions SDK/local HTTP-S3 integration, TypeScript, ESLint, static workflow
   and OCI uploader tests. Ensure `git diff --check` succeeds.
3. Build **three actual** `linux/amd64` OCI images from the exact committed
   source using Docker Buildx in the isolated build environment and test that
   each starts. Verify Sharp, FFmpeg/H.264/AAC/WebP, HLS output and missing-PTS
   fallback, plus a bounded larger MP4. A local esbuild bundle alone does not
   prove Linux image runtime.
4. Use a dedicated disposable/test S3 bucket for external integration if
   explicitly authorized, or the local SDK/HTTP-S3 tests. In production,
   `questions-production-job-smoke.mjs` performs real writes/Job execution and
   MUST NOT run without separate approval. Verify the Questions bucket policy
   still grants public reads ONLY under `questions/uploads/questions/*`.
5. Diagnose the historical Feed Video `MEDIA_PROCESSING_FAILED` with actual
   failing execution logs or a reproducible fixture. Do not call it fixed
   based solely on green smoke tests.

## Existing release mechanics (do not bypass checks)

- The **manual** `Build Cloud.ru media images` workflow builds all three
  worker images when dispatched on `main`. `publish=false` produces OCI
  review artifacts without registry mutation. `publish=true` publishes to
  `gafus.cr.cloud.ru`; Gallery and Questions use Docker Buildx publication.
- **Feed** uses the same workflow but publishes a locally built OCI archive
  with `ci-cd/scripts/upload-cloudru-oci.py` and bounded resumable registry
  requests. It is **not** written to the S3 media bucket. Feed Photo/Video and
  their replicas consume the **same** feed-worker image digest.
- Set all six GitHub variables (IMAGE and SOURCE for each of GALLERY, FEED,
  QUESTIONS) to the verified immutable registry digest + corresponding source
  fingerprint reported by the image workflow.
- `Apply manually pinned Cloud.ru Workers` (explicit confirmation) validates
  the pins and applies the images to all six Jobs. The ordinary `CI/CD
  Pipeline` does **not** publish/apply images and will fail closed if its
  current source fingerprints don't match pinned images/Jobs.

## One-push, manually gated release for changed worker source

The existing workflows **cannot** automatically publish updated workers
and deploy the API in a single uninterrupted CI pass. An initial `main`
push with changed worker trees will run verification but block deployment
until the new worker digests have been manually published, pinned and applied.

With explicit approval and a reviewed, tested commit:

1. Push the reviewed commit once to `main`. The initial automatic run may
   block at `cloudru-prepare-media` due to intentionally stale pins; **do not
   bypass** the source/digest verification. VPS production remains on the old
   application. Stop if any unrelated job fails.
2. Run the manual media-image workflow on that exact main SHA, first with
   `publish=false` for inspection and then, after approval, `publish=true`.
   Validate digests and platforms independently.
3. Set all six GitHub pin variables. Apply with the separately confirmed
   worker-pins workflow, and verify all six Jobs match the pinned digests.
4. The new Questions Job can process old API uploads via its periodic
   compatibility recovery; expect **up to ~15 minutes** for an old API upload
   during the short worker-first cutover. Do not allow an extended mixed
   version rollout.
5. Re-run the existing `main` CI workflow for the same commit SHA (re-run
   all needed checks). When pin verification and read-only CDN checks pass,
   its normal deployment publishes the matching API, web and worker; no
   second Git push is necessary. `Deploy Only` is intentionally forbidden
   until a successful full release provenance check exists.
6. With further authorization, execute the updated single-fixture Questions
   real-Job smoke and synthetic Feed/Gallery end-to-end tests. Observe retry
   counts, S3/private marker cleanup, job cold starts, CPU/RAM/latency and
   Web/Mobile/CDN compatibility; don't touch genuine user media. Stop on
   unexpected results.

If a single *uninterrupted* main pipeline is required, implement and
review a separately approved, manually gated orchestration change **before**
the release; don't silently weaken the pin gates or start production builds
on every push.

## Rollback/compatibility limits

- Old Questions worker + new source marker: the old worker still scans source
  images; the marker remains until a new worker acknowledges it.
- New Questions worker + old API source: legacy recovery scan is periodic,
  not immediate; the app should be updated promptly.
- Any rollback must preserve S3 source, immutable staged WebP, and outstanding
  private work records; never delete users' uploads to resolve a failed Job.
- Cloud.ru Job image updates, all production S3 operations, Git push, registry
  publication and production deploy require explicit permission.

## 2026-10-19 local Linux/amd64 container evidence (no production access)

Docker Desktop Buildx built three images from the current GAFUS Main
working tree without publishing anything:

- `gafus-gallery-worker:local-verification-20261019`: Linux x64;
  Sharp 0.34.3/libvips 8.17.1; full in-container source JPEG/EXIF to two
  private staged WebPs to two immutable final WebPs; successful core mock
  callbacks; original preserved. 0.5 vCPU / 1 GiB limit.
- `gafus-questions-worker:local-verification-20261019`: Linux x64;
  Sharp/WebP; actual AWS SDK talking to an in-container loopback S3
  HTTP server with no external network; transient 503 left S3 work marker
  for retry, successful retry encoded two WebPs, deleted marker, never wrote
  public-final prefix. 0.5 vCPU / 1 GiB limit.
- `gafus-feed-worker:local-verification-20261019`: Linux x64;
  Sharp/WebP, FFmpeg 5.1.9 with libx264/AAC/libwebp; end-to-end HLS/poster
  on MP4 H.264/AAC, MOV HEVC portrait, WebM VP9, 59s MP4 (30 segments),
  correct rejection of 61s, and decoded-frame fallback for missing PTS.
  Ran video scenarios with 1 vCPU and 2 GiB cap.

All three production Node entrypoints passed in-image `node --check`.
Test-only scripts and OCI image tags were local. No running services, no S3
writes outside local loopback, no registry push, no Cloud.ru Jobs execute,
and no production state changes.

These tests prove Linux image executability but not Cloud.ru cold-start,
runtime permissions, IAM/network, registry publication or reproduction of
the historical 55.1 MB failing production Feed video. Preserve the separate
real Cloud.ru/production smoke and approval gates before rollout.

## Feed video limit updated to 120 seconds (local working tree)

The previous 60-second limit is replaced by 120 seconds in shared Feed
contracts (including Mobile picker), Cloud.ru FFprobe/packet/HLS checks,
server-side completion validation and user-visible messages. Video uploads
remain limited to 200 MiB; the existing 1-vCPU video Job keeps its 650-second
Cloud.ru timeout, with a renewable server-side job lease. Bounded HLS
segment count is adjusted to 120; the playlist is still published last.
Linux/amd64 Docker smoke: synthetic 120-second MP4 converted to 60 HLS
segments in about 10.6 seconds at 1 vCPU / 4 GiB; 121-second MP4 rejected
with VIDEO_TOO_LONG. This benchmark used low-resolution synthetic footage
and is not representative of all real uploads.

Existing already-installed native Mobile builds will continue their previous
picker limit until a new Mobile build/update carries the shared Feed contract.
Do not claim the production limit changed until the matching Feed worker
image and API (and applicable clients) have been released.
