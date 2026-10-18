# Cloud.ru Worker images: manual publication and immutable pins

Normal pushes to `main` must **never** build, push or change Cloud.ru worker images/Jobs.
The only Cloud.ru operations in the ordinary application pipeline are the pinned
manifest/source verification, existing Jobs read-back and existing S3 preflight.

The only required processing images are `gafus-gallery-worker`,
`gafus-feed-worker`, `gafus-questions-worker`. The retired Gallery/Feed Origins
must not be published. There are six processing Jobs in Cloud.ru (Gallery,
Questions, four Feed photo/video instances); image publication does NOT automatically
configure or execute those Jobs.

## One-time initial bootstrapping / deliberate worker code update

0. **Initial bootstrap gate:** until the following manual steps finish,
   `CLOUDRU_WORKER_PINS_REQUIRED` must be absent or `false` in GitHub Environment
   `production`. This means the first commit introducing these workflows runs
   checks/builds but **skips** both Cloud.ru Jobs reconciliation and application
   deployment, rather than attempting to deploy against nonexistent pins.
   It is not a separate test push or a deployment.
1. After the reviewed workflows reach `main`, manually run
   **Build Cloud.ru media images** (`.github/workflows/cloudru-media-images.yml`)
   with `publish=true` on `main`. This workflow builds the three images on GitHub
   runners, serially to avoid Registry saturation. It does not deploy to production.
   The ordinary CI pipeline does not depend on this manual run.
2. Require all three matrix jobs to succeed. Each prints non-secret outputs
   `WORKER_PIN_MEDIA`, `WORKER_PIN_IMAGE` (immutable registry digest) and
   `WORKER_PIN_SOURCE` (fingerprint of every corresponding Dockerfile COPY source tree).
   Do **not** accept a report if Registry index or `linux/amd64` check failed.
3. As the authenticated repository operator, from the allowed `gafus1` directory,
   validate each pair with `node infra/cloudru/set-worker-pin.mjs <media> <image>
   <source> --check`, then update GitHub Environment `production` using the **same**
   command with `--apply`. This sets precisely six variables (IMAGE and SOURCE for
   each of gallery/feed/questions). Do not set values for an image whose source
   fingerprint differs from current `main`. The helper verifies the writes.
4. Manually run **Apply manually pinned Cloud.ru Workers**
   (`.github/workflows/cloudru-apply-worker-pins.yml`) from `main`, input
   `confirmation=apply-reviewed-worker-pins`. This is the **only** workflow with
   explicit approval to update the six existing Cloud.ru Jobs. It checks all
   pinned images, checks originless manifest plan, applies the new image/config,
   then waits for all six Jobs to report exactly the expected digest. It does not
   change web/API production containers or trigger new Jobs immediately.
5. After the manual apply workflow completes successfully, set the environment
   gate using `gh variable set CLOUDRU_WORKER_PINS_REQUIRED --env production
   --repo asmtv1/gafus --body true`. Then rerun the **same main GitHub CI run**
   once (no additional commit/push required). Future pushes use normal automatic
   deployment. Do not enable the gate before all six Jobs are verified.
6. Normal `main` push (or a repeat of the existing main run) verifies that the
   pinned digests exist in Cloud.ru Registry, have a Linux AMD64 manifest,
   match unchanged worker source trees, and correspond to the actual deployed
   Cloud.ru Jobs. Then normal Web/API deployment proceeds without reuploading
   media worker images.

If worker code changes (gallery: `apps/gallery-cloud/src`, gallery-storage,
core gallery processing; feed: `apps/feed-cloud/src`, feed-cloud/feed-storage;
questions: `apps/questions-cloud/src` or its Dockerfile), ordinary CI fails
`CLOUDRU_WORKER_SOURCE_CHANGED_<media>` until a *new* image is manually published
and pinned. Pinning is independent of the Web/API commit SHA. No `latest` tags,
unsigned digests, or silent fallback to previously published images.

## Operational safety

- Never publish worker images in the ordinary `main` CI or `Deploy Only` workflow.
- Never delete or change existing Cloud.ru Jobs merely to reuse images.
- Do not edit the source fingerprints to silence a mismatch; publish a reviewed
  image from the updated worker sources instead.
- Keep original private bucket credentials and Beget settings; no Gallery/Feed
  Origin container is part of the new release plan.
- A missing pin stops the normal release **before** any production app mutation.
- If publication is slow, use the manual runner's generous time budget. A failed
  run does not change live Jobs; re-run only the explicitly requested manual build.
