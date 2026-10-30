import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = file => readFileSync(new URL(file, root), "utf8");
const workflow = read(".github/workflows/refactor-vite-release.yml");
const dockerfile = read("ci-cd/docker/Dockerfile-web-vite-refactor");
const nginx = read("ci-cd/docker/nginx-vite-refactor.conf");
const dockerignore = read("ci-cd/docker/Dockerfile-web-vite-refactor.dockerignore");
const localAssetGuard = read("scripts/refactor/check-vite-assets.mjs");

test("refactor Vite CI targets the vite branch without modifying main deploy workflow", () => {
  assert.match(workflow, /branches: \[vite\]/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/vite'/);
  assert.doesNotMatch(workflow, /branches: \[main\]|production-deploy-reusable|ci-cd\.yml/);
  assert.match(workflow, /GAFUS_REFACTOR_IMAGE_PUBLISH == 'enabled'/);
  assert.match(workflow, /environment: refactor-image-publish/);
  assert.match(workflow, /needs: \[verify, docker-smoke, production-containers-smoke\]/);
  assert.doesNotMatch(workflow, /ssh-action|docker-compose|migrate deploy|SERVER_HOST|ghcr\.io\/asmtv1\/gafus-web:/);
});

test("immutable AMD64 Refactor images and no mutable prod latest tag", () => {
  assert.match(workflow, /platforms: linux\/amd64/g);
  assert.match(workflow, /gafus-refactor-web:sha-\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /gafus-refactor-web:latest|gafus-web:latest/);
  assert.match(workflow, /pnpm --filter @gafus\/web-vite build/);
  assert.match(dockerfile, /COPY apps\/web-vite\/dist\/ \/usr\/share\/nginx\/html\//);
  assert.doesNotMatch(dockerfile, /^RUN .*pnpm|^RUN .*npm|apps\/web\/\.next|next start|NEXTAUTH_SECRET|\.env/m);
});

test("SPA fallback does not intercept Hono API and immutable assets", () => {
  assert.match(nginx, /listen 3000;/);
  assert.match(nginx, /location \^~ \/api\/v1\//);
  assert.match(nginx, /proxy_pass http:\/\/\$hono_backend\$request_uri;/);
  assert.match(nginx, /location \^~ \/api\/ \{ return 404; \}/);
  assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(nginx, /immutable/);
  assert.match(nginx, /location = \/healthz/);
});


test("Docker context excludes private local state and OS/mobile build caches", () => {
  assert.match(dockerignore, /^\*\*$/m);
  assert.match(dockerignore, /!apps\/web-vite\/dist\/\*\*/);
  assert.doesNotMatch(dockerignore, /!packages\/|!node_modules|!\.env/);
  assert.doesNotMatch(dockerfile, /COPY apps \.\/apps|COPY \. \./);
});


test("Docker packages the exact previously verified CI build artifact", () => {
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.equal(workflow.match(/actions\/download-artifact@v4/g)?.length, 2);
  assert.match(workflow, /name: gafus-refactor-vite-dist/);
  assert.match(workflow, /needs: verify/);
  assert.match(workflow, /needs: \[verify, docker-smoke, production-containers-smoke\]/);
  assert.match(workflow, /test -s apps\/web-vite\/dist\/index\.html/);
  assert.match(workflow, /--network-alias gafus-api/);
  assert.match(workflow, /X-Forwarded-Proto: https/);
});


test("Vite assets are verified within the current Refactor frontend, without Next baselines", () => {
  assert.match(localAssetGuard, /apps\/web-vite\/public/);
  assert.match(localAssetGuard, /apps\/web-vite\/src/);
  assert.doesNotMatch(localAssetGuard, /apps\/web\/src/);
});

test("CI refuses partial Git pushes that omit untracked Vite sources", () => {
  assert.match(workflow, /Fail early if Refactor source is absent from pushed commit/);
  assert.match(workflow, /git ls-files --error-unmatch/);
  assert.match(workflow, /apps\/web-vite\/package\.json/);
  assert.match(workflow, /apps\/web-vite\/src\/App\.tsx/);
  assert.match(workflow, /scripts\/refactor\/check-vite-assets\.mjs/);
  assert.match(workflow, /git ls-files apps\/web-vite\/src/);
});


test("release candidate builds every production-owned image for AMD64 before publishing", () => {
  assert.match(workflow,/production-containers-smoke:/);
  const images = [
    ["web", "Dockerfile-web-optimized"],
    ["trainer-panel", "Dockerfile-trainer-panel-optimized"],
    ["admin-panel", "Dockerfile-admin-panel-optimized"],
    ["api", "Dockerfile-api-optimized"],
    ["worker", "Dockerfile-worker-optimized"],
    ["bull-board", "Dockerfile-bull-board-optimized"],
    ["prisma", "Dockerfile-prisma-optimized"],
  ];
  for(const [name,file] of images) assert.match(workflow,new RegExp(`name: ${name}, file: ${file}`));
  const build=workflow.split('  production-containers-smoke:')[1]?.split('  # Explicit opt-in:')[0]??'';
  assert.match(build,/platforms: linux\/amd64/);
  assert.match(build,/push: false/);
  assert.match(build,/load: true/);
  assert.match(build,/docker image inspect/);
  assert.match(build,/--network none --read-only/);
  assert.match(build,/--entrypoint ffmpeg/);
  assert.match(build,/createRequire\(require\.resolve\("@gafus\/prisma\/package\.json"\)\)/);
  assert.match(build,/fail-fast: false/);
  assert.match(build,/Refuse Docker success from a partial Refactor checkout/);
  assert.doesNotMatch(build,/^\s+needs: verify$/m);
  assert.doesNotMatch(build,/docker\/login-action|secrets\.|ssh-action|migrate deploy|push: true/);
});


test("release CI validates production Compose with synthetic-only environment", () => {
  assert.match(workflow,/python3 ci-cd\/scripts\/refactor-verify-compose\.py/);
  const composeGuard=read('ci-cd/scripts/refactor-verify-compose.py');
  assert.match(composeGuard,/--no-env-resolution/);
  assert.match(composeGuard,/--env-file/);
  assert.match(composeGuard,/\/dev\/null/);
  assert.doesNotMatch(composeGuard,/docker compose up|docker compose down|envfile=.production|docker stack deploy/);
});


test("static Vite image Dockerfiles use nginx and API/worker images retain pnpm 10.12.4", () => {
  assert.equal(JSON.parse(read("package.json")).packageManager, "pnpm@10.12.4");
  for (const app of ["web", "trainer-panel", "admin-panel"]) {
    const docker = read(`ci-cd/docker/Dockerfile-${app}-optimized`);
    assert.match(docker, /FROM nginx:1\.27-alpine/);
    assert.doesNotMatch(docker, /next|\.next|node .*server/);
  }
  for (const image of ["api", "worker", "bull-board", "prisma"]) {
    const docker = read(`ci-cd/docker/Dockerfile-${image}-optimized`);
    assert.match(docker, /corepack prepare pnpm@10\.12\.4 --activate/);
  }
});

test("Prisma runtime image reuses pnpm build-stage cache without npm network", () => {
  const prisma = read("ci-cd/docker/Dockerfile-prisma-optimized");
  assert.match(prisma,/ENV COREPACK_HOME=\/opt\/gafus-corepack/g);
  assert.match(prisma,/COPY --from=base \/opt\/gafus-corepack \/opt\/gafus-corepack/);
  assert.match(prisma,/COREPACK_ENABLE_NETWORK=0 corepack prepare pnpm@10\.12\.4/);
});


test("refactor image matrix exactly matches production build-images Dockerfiles", () => {
  const prod = read(".github/workflows/ci-cd.yml");
  const section = prod.split("  build-images:")[1]?.split("  cloudru-media-contracts:")[0] ?? "";
  const candidate = workflow.split("  production-containers-smoke:")[1]?.split("  # Explicit opt-in:")[0] ?? "";
  const sources = text => [...text.matchAll(/file:\s*\"?(Dockerfile-[a-z-]+-optimized)\"?/g)]
    .map(item => item[1]).sort();
  const expected = sources(section);
  assert.equal(expected.length, 7);
  assert.deepEqual(sources(candidate), expected);
});


test("Prisma Docker and hosted CI require importable generated client, not just image layers", () => {
  const prisma = read("ci-cd/docker/Dockerfile-prisma-optimized");
  assert.match(prisma,/COPY --from=base \/app\/node_modules\/\.prisma \.\/node_modules\/\.prisma/);
  assert.match(prisma,/test -s \/app\/node_modules\/\.prisma\/client\/default\.js/);
  assert.match(prisma,/require\('@prisma\/client'\)/);
  assert.match(workflow,/if \[\[ '\$\{\{ matrix\.image\.name \}\}' == prisma \]\]/);
  assert.match(workflow,/require\("@prisma\/client"\)/);
});
