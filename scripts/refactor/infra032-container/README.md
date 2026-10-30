# INFRA032 artifact-only Vite SPA packaging (NONDEPLOY design)

These files are NOT a deploy pipeline. Each image serves exactly ONE already-built Vite SPA (Web, Trainer opt-in, or Admin opt-in). There is no Hono API proxy or runtime API discovery; `/api` and `/api/*` always return 404. Consumers require an independently approved same-origin API routing design before any integration release.

## Mandatory curation gate before any future Docker command

The build context must be a newly prepared **explicit curated directory inside `/Users/asmtv1/Desktop/gafus-refactor`**, for example `scripts/refactor/infra032-container/.curated-web/`, consisting of **only** `index.html`, the `assets/` directory with previously approved Vite fingerprinted static files, and a copy of this `nginx.conf`. Reject symlinks, absolute/outside-root resolved paths, other top-level entries, credentials, hidden files, source maps if not approved, source code, `.env`, `node_modules`, build metadata and nonstatic files. Review asset inventory, hashes, MIME types, sizes, HTML references to each JS/CSS asset and absence of external path refs before curation; keep approved build outputs unmodified. No automatic copy from workspace or peer-owned `dist`; release owner must choose and authorize a specific immutable artifact directory. The Dockerfile itself must be supplied via `-f` from this owned template directory; never use project root as Docker context.

**Future command example only — DO NOT RUN without explicit build/runtime permission and a verified pinned image digest:**

```sh
R=/Users/asmtv1/Desktop/gafus-refactor
CONTEXT="$R/scripts/refactor/infra032-container/.curated-web"
# Prerequisite: verify curated context contents and immutable approved output SHA list.
# Prerequisite: pin base nginxinc/nginx-unprivileged to an approved immutable digest.
docker build --pull=false -f "$R/scripts/refactor/infra032-container/Dockerfile" -t gafus-refactor-web-static:review "$CONTEXT"
```

For Trainer/Admin, use separate independently reviewed `.curated-trainer` and `.curated-admin` directories and unique image tags. **Do not run** the example now. The base tag is only a proposal (`nginxinc/nginx-unprivileged:stable-alpine`); its digest, user, read-only filesystem compatibility, actual default entrypoint and startup have NOT been validated or pulled. Runtime deployment must separately authorize ports, image digest, API ingress, platform filesystem/logging, health/probe semantics and external routing. Nginx `listen 8080` is nonprivileged; no provider, DNS, TLS or cookie policy is invented. Old installed service-worker removal remains a separate browser migration gate, not solved by returning 404 for new requests.

## Explicit curation CLI — implemented, nondeploy

`prepare-context.mjs` never discovers a Web/Trainer/Admin build. The caller must supply all three absolute paths inside the permitted Git root: the separately authorized **prebuilt static directory**, an owner-approved SHA256 manifest file, and a **new** destination with an existing parent. No input file is overwritten. Manifest format is deliberately narrow:

```json
{"schema":"ag4-static-artifact-hashes-v1","files":[{"path":"index.html","sha256":"<64 lowercase hex>"},{"path":"assets/main-ABCDEF12.js","sha256":"<64 lowercase hex>"},{"path":"assets/main-ABCDEF12.css","sha256":"<64 lowercase hex>"}]}
```

Replace example digests with independently confirmed real values; do **not** treat the example as a valid manifest. Required inputs: `index.html`, flat `assets/` with SHA-pinned fingerprinted `js/css` and supported `png/jpg/jpeg/webp/svg/ico/woff/woff2/avif`. Other asset types, nested asset trees, source maps, files over 10 MiB, zero-size files, links, hidden files, external/encoded HTML references, unsupported JS/CSS dependency patterns and unexpected top-level files are explicitly rejected rather than guessed safe. This tool does not certify arbitrary Vite output; a rejected output needs a separately reviewed expanded policy, not an unsafe fallback. HTML asset links must point to matching present files. The Dockerfile copies only `index.html`, `assets/` and `nginx.conf`; the generated `artifact-sha256.json` in the curated directory is a local audit receipt, **not copied into the container**.

```sh
R=/Users/asmtv1/Desktop/gafus-refactor
TOOL="$R/scripts/refactor/infra032-container/prepare-context.mjs"
SOURCE="$R/<explicit-approved-prebuilt-static-directory>"
HASHES="$R/<approved-artifact-sha256-manifest.json>"
DEST="$R/scripts/refactor/infra032-container/.curated-web-approved-v1"
node "$TOOL" dry-run "$SOURCE" "$HASHES" "$DEST"
# Only after review of dry-run output and independently authorized source/hash provenance:
node "$TOOL" write "$SOURCE" "$HASHES" "$DEST"
```

`write` validates the full manifest and references **before** copying, stages within the destination's parent and only publishes via a final directory rename. If validation or stage copying fails, no destination is intentionally published and the tool removes only its freshly created staging directory. Existing destinations fail closed; never target production paths. Source hashes are checked again during copying. This is local packaging validation, **not** approval for Docker/runtime/HTTP, Hono ingress, native/mobile, or deployment. Paths within angle brackets above are intentionally placeholders and must be replaced by exact owner-approved project-contained paths.


## Strict local Vite split dependency graph (AG4-INFRA032 extension)

The new curation implementation parses **JavaScript source as ECMAScript modules** using the already-installed `acorn` parser (no JS execution) and parses CSS with installed `postcss` plus `postcss-value-parser`. It supports relative or `/assets/`-rooted static `import ... from`, side-effect `import`, `export ... from`, `export * from`, and **literal** `import('./fingerprinted-chunk.js')`; CSS `@import "./fingerprinted.css"` and local `url(./fingerprinted-font.woff2)` or local hashed image refs. Dependencies are resolved against the source asset, checked against the flat fingerprinted allowlist and exact SHA-256 manifest, and every copied asset must be reachable from HTML through this parsed dependency graph. Local `fetch()` runtime API calls are not interpreted as static dependency links; this curation tool is *not* an application security scanner or browser-boundary proof.

Unsupported (explicit nonzero refusal): nonliteral imports, CSS import media modifiers or ambiguous CSS syntax, bare package/external JS imports, remote/data/encoded/fragment/query refs, parent traversal, `new URL()` asset references, media/other unsupported extensions, extra unreferenced files, untrusted HTML markup and nested chunk layouts. This limited policy does not claim compatibility with every Vite build; seek a separately reviewed policy update rather than relaxing validation. The previously accepted browser-boundary checker remains independent and must not be bypassed. Native, security, auth, media-provider, prod and signing gates remain closed.

Local implementation acceptance used only AG4-owned synthetic static fixture bytes: entry→shared + literal deferred chunk, CSS→local @import + local font, success dry-run and atomic write, exact seven-file copy/hash receipt, and nonzero refusal before publishing on missing chunk, external JS/CSS import, traversal and nonliteral import. **No actual AG2 Web or Panel build artifact was selected, read, copied, or certified.**

## AG4-approved historical panel curation receipts (2026-10-23)

AG4 explicitly selected its **historical accepted snapshots**, not current panel release builds:
- Trainer source `scripts/refactor/infra032-vite-acceptance-trainer-20261022`, HTML SHA256 `218a3e4c0c191c0bba15b3ddb9bd5d49946c23d2676f9961b980cb8c0f049dc8`, JS SHA256 `040bafc562f9ff679e444d0e2411a3099d805907421350141bdbb4ba437f87f8`; approved manifest `approved-trainer-20261022-sha256.json`; curated output `.curated-trainer-20261022/`.
- Admin source `scripts/refactor/infra032-vite-acceptance-admin-20261022`, HTML SHA256 `090ae921abea15409f97a3b1714cbd8de10a1a2ccec80efb4fe6631a038f8b6c`, JS SHA256 `3406863af3128ef808227a2c4e5cc952367d857ddd5e1dbcdb5b233e24cb9a9a`; approved manifest `approved-admin-20261022-sha256.json`; curated output `.curated-admin-20261022/`.

Each new curated directory contains exactly `index.html`, one hashed JS in `assets/`, `nginx.conf` and local `artifact-sha256.json` receipt (the latter is not Docker-copied). The artifact-only Dockerfile copies only the first three allowlisted paths. Exact hashes/byte equality were verified after write. This does not validate running JavaScript, current panel UI permissions, CDN, container base, ingress, or image runtime. The parser allows ordinary runtime `new URL()` that does not reference `import.meta.url`; `new URL(..., import.meta.url)` remains unsupported as a static asset factory. Standard empty closing script tags remain valid HTML rather than being rejected by a precheck. No other source or build was selected.

## Read-only post-curation integrity gate

Before handing a previously curated historical context to a separately authorized packaging process, invoke `verify-context.mjs` with **three explicit independent inputs**: the existing curated context, an owner-approved source SHA256 manifest (do not derive trust from the context's own receipt), and the separately approved nginx.conf SHA256. The verifier does not write, regenerate, heal or publish anything. It validates exact top-level and flat asset allowlists, no symlinks, relative file graph via the same Acorn/PostCSS rules as `prepare-context`, all approved byte hashes, config pin, and exact receipt entries. The receipt is checked against the independent inputs, not accepted as authority. Example on the historical AG4-approved Trainer and Admin snapshots:

```sh
R=/Users/asmtv1/Desktop/gafus-refactor
BASE="$R/scripts/refactor/infra032-container"
PIN=d51e7b60c51c8b1d7a9f7da7298cb8fc3f5471b4fd9c2f4034fe0614bd051a30
node "$BASE/verify-context.mjs" "$BASE/.curated-trainer-20261022" "$BASE/approved-trainer-20261022-sha256.json" "$PIN"
node "$BASE/verify-context.mjs" "$BASE/.curated-admin-20261022" "$BASE/approved-admin-20261022-sha256.json" "$PIN"
```

Actual local verify succeeded for both historical contexts. Separate new **own cloned** negative cases rejected mutated JS, missing or extra assets, symlinks, forged receipt and mutated nginx config with nonzero exit and without modifying the checked package. A verified hash is not a signature or proof of owner approval, freshness, container runtime behavior, DNS/API ingress, permissions, UI, or release suitability. Continue to independently approve the manifest/config pins and current release artifact before any future Docker action.
