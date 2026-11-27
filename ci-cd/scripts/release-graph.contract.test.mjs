import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
const path = '.github/workflows/ci-cd.yml';
const wf = YAML.parse(readFileSync(path, 'utf8'));
const jobs = wf.jobs;
const needs = name => typeof jobs[name].needs === 'string' ? [jobs[name].needs] : jobs[name].needs || [];
const builds = ['web','trainer-panel','admin-panel','api','worker','bull-board','prisma'];

test('all release jobs have a valid DAG: no unknown prerequisites or cycles', () => {
  const active = new Set(), visited = new Set();
  const walk = name => {
    assert(jobs[name], `UNKNOWN_DEPENDENCY:${name}`);
    assert(!active.has(name), `RELEASE_JOB_CYCLE:${name}`);
    if (visited.has(name)) return;
    active.add(name);
    for (const dep of needs(name)) walk(dep);
    active.delete(name); visited.add(name);
  };
  for (const name of Object.keys(jobs)) walk(name);
  assert.equal(visited.size, Object.keys(jobs).length);
});

test('all seven production images are mandatory before deploy; no mutable latest image', () => {
  const imageDefs = jobs['build-images'].strategy.matrix.image;
  assert.deepEqual(imageDefs.map(x=>x.name), builds);
  assert.equal(new Set(imageDefs.map(x=>x.file)).size, 7);
  for (const img of imageDefs) {
    assert(img.file.startsWith('Dockerfile-') && img.file.endsWith('-optimized'));
    assert(existsSync(`ci-cd/docker/${img.file}`), `MISSING_BUILD_DOCKERFILE:${img.file}`);
    assert(!img.tag.includes('latest'));
  }
  const deploy = jobs['deploy-production'];
  assert(needs('deploy-production').includes('build-images'));
  assert(needs('deploy-production').includes('cutover-preflight'));
  for (const gate of ['security','build-apps','build-images','cloudru-media-contracts','cutover-preflight','beget-readonly-preflight']) {
    assert(deploy.if.includes(`needs.${gate}.result == 'success'`), `MISSING_SUCCESS_GATE:${gate}`);
  }
  assert(!deploy.if.includes(`needs.build-images.result != 'failure'`));
});

test('the full graph orders app deployment, job sync/verify and post-deploy validation', () => {
  assert.deepEqual(needs('cloudru-jobs-sync'), ['deploy-production']);
  assert.deepEqual(needs('cloudru-jobs-verify'), ['cloudru-jobs-sync']);
  assert(needs('beget-verify-after-deploy').includes('deploy-production'));
  assert(needs('beget-verify-after-deploy').includes('cloudru-jobs-verify'));
  assert(jobs['deploy-production'].if.includes('github.ref == \'refs/heads/main\''));
  assert(jobs['cloudru-jobs-sync'].if.includes('github.ref == \'refs/heads/main\''));
});

test('no release graph job is reached through a branchless manual bypass', () => {
  assert.equal(wf.concurrency['cancel-in-progress'], false);
  for (const name of ['build-images','prepare-docker','cloudru-jobs-preflight','deploy-production','cloudru-jobs-sync','cloudru-jobs-verify']) {
    assert(jobs[name].if?.includes('github.ref'), `UNGUARDED_PRODUCTION_JOB:${name}`);
  }
});


test('Cloud media CI gate runs actual Feed/Chat2/Questions Vitest instead of a pnpm no-op', () => {
  const manifest = JSON.parse(readFileSync('apps/feed-cloud/package.json', 'utf8'));
  assert.match(manifest.scripts?.test ?? '', /vitest run.*vitest\.config\.ts/,
    'CLOUD_RUNTIME_TEST_SCRIPT_MUST_EXECUTE_VITEST');
  const cloud = jobs['cloudru-media-contracts'];
  assert(cloud && typeof cloud.if === 'string' && cloud.if.includes('refs/heads/main'),
    'CLOUD_RUNTIME_TEST_JOB_SCOPE_CHANGED');
  assert(needs('cloudru-media-contracts').includes('prepare-deps'),
    'CLOUD_RUNTIME_MUST_WAIT_FOR_COMPILED_WORKSPACE_PACKAGES');
  const restore = cloud.steps.find(x => x.name === 'Restore compiled workspace dependencies');
  assert.equal(restore?.uses, 'actions/cache/restore@v5',
    'CLOUD_RUNTIME_WORKSPACE_BUILD_RESTORE_MISSING');
  assert.equal(restore?.with?.key, '${{ needs.prepare-deps.outputs.cache-key }}-deps');
  assert.match(restore?.with?.path ?? '', /packages\/\*\/dist/);
  const verify = cloud.steps.find(x => x.name === 'Verify media workspace dependencies are built (blocking)');
  const rebuild = cloud.steps.find(x => x.name === 'Build media runtime and its workspace dependencies after cache miss');
  assert.equal(rebuild?.if, "steps.media-workspace-cache.outputs.cache-hit != 'true'",
    'CLOUD_RUNTIME_CACHE_MISS_MUST_REBUILD');
  assert.match(rebuild?.run ?? '', /turbo run build.*--filter=@gafus\/feed-cloud-runtime\.\.\./,
    'CLOUD_RUNTIME_CACHE_MISS_MUST_BUILD_TRANSITIVE_DEPENDENCIES');
  assert.doesNotMatch(verify?.run ?? '', /MEDIA_WORKSPACE_BUILD_CACHE_MISSING/);

  assert.match(verify?.run ?? '', /MEDIA_WORKSPACE_PACKAGE_NOT_BUILT/);
  const provision = cloud.steps.findIndex(x => x.name === 'Provision FFmpeg/libx264 for real media tests (blocking)');
  const gateIndex = cloud.steps.findIndex(x => x.name === 'Cloud media runtime unit contracts (blocking)');
  assert(provision !== -1 && provision < gateIndex, 'FFMPEG_PROVISION_MUST_PRECEDE_MEDIA_TESTS');
  const install = cloud.steps[provision]?.run ?? '';
  assert.match(install, /sudo apt-get install -y --no-install-recommends ffmpeg/);
  assert.match(install, /command -v ffmpeg/);
  assert.match(install, /ffmpeg -hide_banner -encoders.*libx264/);
  assert.doesNotMatch(install, /grep -q ['\"]?libx264|\| head -n 1/);
  const gate = cloud.steps[gateIndex];
  assert.equal(gate?.run, 'pnpm --filter @gafus/feed-cloud-runtime test',
    'CLOUD_RUNTIME_TEST_GATE_MISSING_OR_NOOP');
  assert(needs('deploy-production').includes('cloudru-media-contracts'),
    'CLOUD_RUNTIME_TEST_MUST_BLOCK_DEPLOY');
});

test('all public Vite SPA Docker images normalize runner-private file modes for unprivileged Nginx', () => {
  for (const component of ['web', 'trainer-panel', 'admin-panel']) {
    const source = readFileSync(`ci-cd/docker/Dockerfile-${component}-optimized`, 'utf8');
    const copy = source.indexOf('COPY apps/');
    const permissionFix = source.indexOf('RUN chmod -R a+rX /usr/share/nginx/html');
    assert(copy !== -1 && permissionFix > copy,
      `STATIC_NGINX_ASSET_NOT_WORLD_READABLE:${component}`);
    assert(permissionFix < source.indexOf('EXPOSE '),
      `STATIC_NGINX_PERMISSION_FIX_AFTER_RUNTIME:${component}`);
  }
});

test('image matrix PR smoke is read-only and full gates precede production publish', () => {
  const job = jobs['build-images'];
  const publish = job.steps.find(s=>s.name?.startsWith('Build and push'));
  assert(publish?.with?.push && publish.with.push.includes("github.ref == 'refs/heads/main'"),
    'PR_CANNOT_PUBLISH_IMAGES');
  assert.equal(publish.with.load, "${{ github.event_name == 'pull_request' }}",
    'PR_MUST_LOAD_LOCAL_IMAGES_FOR_SMOKE');
  assert.equal(job.permissions.contents,'read','PR_BUILD_MUST_HAVE_READ_ONLY_PERMISSION');
  for (const dependency of ['security','build-apps','observability-contracts','cloudru-media-contracts','cutover-preflight']) {
    assert(needs('build-images').includes(dependency),`RELEASE_BUILD_BYPASS:${dependency}`);
    assert(job.if.includes(`needs.${dependency}.result == 'success'`),
      `RELEASE_BUILD_GATE_NOT_STRICT:${dependency}`);
  }
  const manifest = jobs['release-images-manifest'];
  assert.deepEqual(needs('release-images-manifest'), ['build-images']);
  assert(needs('deploy-production').includes('release-images-manifest'));
  assert(jobs['deploy-production'].if.includes("needs.release-images-manifest.result == 'success'"));
  assert(manifest.steps.some(s=>s.name?.includes('Refuse partial, duplicate, cross-SHA/run')));
  assert(job.steps.some(s=>s.name?.includes('runtime exports and immutable Linux AMD64 image')));
});

test('PR into main cannot bypass Cloud media gate before local image smoke', () => {
  const media=jobs['cloudru-media-contracts'];
  const images=jobs['build-images'];
  assert.match(media.if,/github.event_name == 'pull_request' && github.base_ref == 'main'/,
    'PR_MAIN_MEDIA_GATE_SKIPPED');
  assert.match(images.if,
    /needs.observability-contracts.result == 'success' &&\s+needs.cloudru-media-contracts.result == 'success' &&\s+\(github.event_name == 'pull_request' \|\|\s+needs.cutover-preflight.result == 'success'\)/,
    'PR_MAIN_IMAGE_SMOKE_WITHOUT_MEDIA_GATE');
  // A skipped or failed prerequisite must not be hidden behind the PR branch.
  assert.doesNotMatch(images.if,
    /github.event_name == 'pull_request' \|\|\s*\(needs.cloudru-media-contracts.result/,
    'PR_MAIN_MEDIA_GATE_BYPASS');
});

test('Vite public bits compile exactly once with sealed private maps, then transfer to Docker by SHA', () => {
  const app=jobs['build-apps'];
  const compile=app.steps.find(s=>s.name==='Build, test, typecheck apps');
  const privateVerify=app.steps.find(s=>s.name==='Verify the three sealed private Vite source-map manifests');
  const publicPack=app.steps.find(s=>s.name==='Pack and verify SHA-scoped public Vite release artifacts');
  const privateArchive=app.steps.find(s=>s.name?.startsWith('Upload immutable private Web release maps from build-apps'));
  const publicUpload=app.steps.find(s=>s.name?.startsWith('Upload public Vite release artifacts'));
  assert.equal(compile.env.GAFUS_PRIVATE_MAPS_ENABLED,'true');
  assert.equal(compile.env.TURBO_FORCE,'true',
    'Private sealed maps are outside Turbo outputs: release builds must bypass cache reads');
  assert.equal(compile.env.GAFUS_RELEASE_SHA,'${{ github.sha }}');
  assert.equal(compile.env.VITE_GAFUS_BUILD_ID,'${{ github.sha }}');
  assert(compile.run.includes('--concurrency=1') && compile.run.includes('github.base_ref'),
    'PR_MAIN_MUST_BUILD_ALL_VITE_DIST_BEFORE_DOCKER');
  assert(privateVerify && privateVerify.run.includes('upload-private-web-sourcemaps.mjs'));
  assert(publicPack && publicPack.run.includes('vite-release-dist-artifacts.mjs pack'));
  assert(privateArchive && privateArchive.if.includes("github.event_name == 'push'") &&
    privateArchive.if.includes('vars.GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED'),
    'PRIVATE_MAPS_MUST_NOT_UPLOAD_ON_PR');
  assert(!publicUpload.with['include-hidden-files'], 'PUBLIC_DIST_MUST_NOT_COPY_RAW_HIDDEN_PATHS');
  assert.equal(publicUpload.with.name, 'vite-public-dists-${{ github.sha }}',
    'DIST_ARTIFACT_MUST_BIND_EXACT_RELEASE_SHA');
  assert.equal(publicUpload.with.overwrite, true,
    'DIST_ARTIFACT_MUST_REPLACE_SAME_RUN_SHA_ON_BUILD_APPS_RETRY');
  assert(!publicUpload.with.name.includes('run_attempt'),
    'DIST_ARTIFACT_MUST_SURVIVE_FAILED_ONLY_RUN_ATTEMPT');
  const idx=name=>app.steps.findIndex(s=>s.name===name);
  assert(idx(compile.name)<idx(privateVerify.name)&&
    idx(privateVerify.name)<idx(publicPack.name)&&
    idx(publicPack.name)<idx(privateArchive.name)&&
    idx(privateArchive.name)<idx(publicUpload.name));
  const imageSteps=jobs['build-images'].steps;
  const fetch=imageSteps.find(s=>s.name==='Download same-SHA public Vite release artifact');
  const restore=imageSteps.find(s=>s.name==='Restore and verify exact public Vite dist from build-apps');
  assert(fetch?.with?.name===publicUpload.with.name,'MISMATCHED_DIST_ARTIFACT_IDENTITY');
  assert.equal(fetch.with['run-id'], undefined,
    'DIST_ARTIFACT_DOWNLOAD_MUST_STAY_WITHIN_SAME_CI_RUN');
  assert.equal(fetch.with['repository'], undefined,
    'DIST_ARTIFACT_DOWNLOAD_MUST_STAY_WITHIN_SAME_REPOSITORY');
  // Regression: on failed-only retries build-apps may have published in attempt
  // 1 while build-images resumes in attempt 4. Artifact identity must agree.
  const resolvedName = (template, attempt) => template
    .replace('${{ github.sha }}', 'a'.repeat(40))
    .replace('${{ github.run_attempt }}', attempt);
  assert.equal(resolvedName(publicUpload.with.name, '1'),
    resolvedName(fetch.with.name, '4'), 'FAILED_ONLY_RETRY_MUST_FIND_PUBLIC_DIST');
  assert(restore?.run.includes('vite-release-dist-artifacts.mjs restore'));
  assert(restore.run.includes('verify-gafus-app-links.mjs'), 'WEB_APP_LINKS_MUST_SURVIVE_TAR');
  assert(!imageSteps.some(s=>s.name==='Compile Vite SPA before packaging into Nginx image'),
    'SECOND_VITE_REBUILD_FORBIDDEN');
  assert(imageSteps.indexOf(restore)<imageSteps.findIndex(s=>s.name?.startsWith('Build and push')));
  const turbo=JSON.parse(readFileSync('turbo.json','utf8'));
  for(const key of ['GAFUS_PRIVATE_MAPS_ENABLED','GAFUS_PRIVATE_MAPS_DIR','GAFUS_RELEASE_SHA','VITE_GAFUS_BUILD_ID'])
    assert(turbo.globalEnv.includes(key),`TURBO_STRICT_ENV_LOSES_RELEASE_ID:${key}`);
});

test('Admin uses one canonical Vite config for build, dev and preview', () => {
  const root='apps/admin-panel';
  const manifest=JSON.parse(readFileSync(root+'/package.json','utf8'));
  for (const [name,command] of Object.entries({build:'vite build',dev:'vite',start:'vite preview'})) {
    assert(manifest.scripts[name].startsWith(command+' --config vite.config.mjs'),
      'ADMIN_VITE_NONCANONICAL_ENTRY:'+name);
  }
  assert(existsSync(root+'/vite.config.mjs'));
  assert(!existsSync(root+'/src/admin-live/vite.config.mjs'),
    'ADMIN_VITE_ORPHAN_CONFIG_REINTRODUCED');
  const config=readFileSync(root+'/vite.config.mjs','utf8');
  assert.match(config,/new URL\("\.\/src\/admin-live\/", import\.meta\.url\)/);
  assert.match(config,/new URL\("\.\/dist\/", import\.meta\.url\)/);
  assert.match(readFileSync('ci-cd/docker/Dockerfile-admin-panel-optimized','utf8'),
    /COPY apps\/admin-panel\/dist\//);
});
