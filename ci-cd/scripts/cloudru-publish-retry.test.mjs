import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptsDir, "../..");
const revision = "a".repeat(40);
const transientAuth =
  "failed to fetch oauth token: unexpected status from POST request to https://id.cloud.ru/auth/system/docker/token: 502 Bad Gateway";
const transientRegistry =
  "failed to push to gafus.cr.cloud.ru/gafus-feed-worker: 503 Service Unavailable";

function run(scenario, args = ["feed", "worker", "Dockerfile", revision]) {
  // All test artifacts remain inside the permitted project and are removed
  // after each test; no Docker daemon or registry is accessed.
  const dir = mkdtempSync(join(scriptsDir, ".cloudru-publish-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const docker = `#!/usr/bin/env bash
set -euo pipefail
counter=0
if [[ -f "$RUNNER_TEMP/counter" ]]; then counter="$(cat "$RUNNER_TEMP/counter")"; fi
counter=$((counter + 1))
printf '%s\n' "$counter" > "$RUNNER_TEMP/counter"
printf '%s\n' "$*" >> "$RUNNER_TEMP/arguments"
case "$FAKE_SCENARIO" in
  502-then-success) if (( counter < 3 )); then echo '${transientAuth}' >&2; exit 1; fi ;;
  registry-503) if (( counter == 1 )); then echo '${transientRegistry}' >&2; exit 1; fi ;;
  always-429) echo 'failed to push to gafus.cr.cloud.ru/gafus-feed-worker: 429 Too Many Requests' >&2; exit 1 ;;
  unauthorized-401) echo 'failed to fetch oauth token: https://id.cloud.ru/auth/system/docker/token: 401 Unauthorized' >&2; exit 1 ;;
  forbidden-403) echo 'failed to fetch oauth token: https://id.cloud.ru/auth/system/docker/token: 403 Forbidden' >&2; exit 1 ;;
  build-error) echo 'ERROR: failed to solve: pnpm build failed' >&2; exit 1 ;;
  upload-timeout) if (( counter == 1 )); then echo '#17 pushing layers'; exit 124; fi ;;
  build-timeout) echo '#10 RUN npm install'; exit 124 ;;
esac
echo "fake publish succeeded"
`;
  writeFileSync(join(bin, "docker"), docker, { mode: 0o755 });
  writeFileSync(join(bin, "timeout"), '#!/bin/sh\n[ "$1" = "--kill-after=30s" ] && [ "$2" = "10m" ] || exit 2\nshift 2\nexec "$@"\n', { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$RUNNER_TEMP/sleeps"\n', {
    mode: 0o755,
  });
  try {
    const result = spawnSync("bash", ["ci-cd/scripts/publish-cloudru-image.sh", ...args], {
      cwd: root,
      env: {
        ...process.env,
        PATH: bin + ":" + process.env.PATH,
        RUNNER_TEMP: dir,
        FAKE_SCENARIO: scenario,
      },
      encoding: "utf8",
      timeout: 15000,
    });
    const count = readFileSync(join(dir, "counter"), "utf8").trim();
    const argumentLog = readFileSync(join(dir, "arguments"), "utf8");
    const delays =
      result.status === 0 || result.status === 1
        ? readFileSyncOrEmpty(join(dir, "sleeps")).trim().split("\n").filter(Boolean)
        : [];
    return { result, count: Number(count), argumentLog, delays };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function readFileSyncOrEmpty(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

test("Cloud.ru OAuth 502 retries then publishes immutable image", () => {
  const { result, count, argumentLog, delays } = run("502-then-success");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(count, 3);
  assert.deepEqual(delays, ["10", "20"]);
  assert.match(argumentLog, /--platform linux\/amd64/);
  assert.match(argumentLog, /--provenance=true/);
  assert.match(argumentLog, /--push/);
  assert.match(argumentLog, new RegExp("gafus-feed-worker:" + revision));
});

test("Cloud.ru registry 503 retries immutable publication", () => {
  const { result, count } = run("registry-503");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(count, 2);
});

test("Cloud.ru registry 429 fails closed after bounded attempts", () => {
  const { result, count, delays } = run("always-429");
  assert.notEqual(result.status, 0);
  assert.equal(count, 4);
  assert.deepEqual(delays, ["10", "20", "40"]);
});

test("stalled layer upload retries after the bounded attempt times out", () => {
  const { result, count } = run("upload-timeout");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(count, 2);
});

for (const scenario of ["unauthorized-401", "forbidden-403", "build-error", "build-timeout"]) {
  test(`${scenario} must not be retried`, () => {
    const { result, count, delays } = run(scenario);
    assert.notEqual(result.status, 0);
    assert.equal(count, 1);
    assert.deepEqual(delays, []);
  });
}

test("Only reviewed Cloud.ru images and immutable SHA tags are allowed", () => {
  const invalid = [
    ["feed", "worker", "../Dockerfile", revision],
    ["feed", "worker", "Dockerfile", "latest"],
    ["api", "worker", "Dockerfile", revision],
  ];
  for (const args of invalid) {
    const dir = mkdtempSync(join(scriptsDir, ".cloudru-publish-test-"));
    try {
      const result = spawnSync("bash", ["ci-cd/scripts/publish-cloudru-image.sh", ...args], {
        cwd: root,
        env: { ...process.env, RUNNER_TEMP: dir },
        encoding: "utf8",
        timeout: 10000,
      });
      assert.notEqual(result.status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
