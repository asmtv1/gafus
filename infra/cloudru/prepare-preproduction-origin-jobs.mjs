/** Read-only plan: digest-pinned Cloud.ru Origin and Job manifests. No production writes. */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cloudruMediaManifests } from "./media-manifests.mjs";
import { parse } from "dotenv";
if (process.env.GAFUS_MANIFEST_PREVIEW_CONFIRM !== "offline-no-release")
  throw Error("PREVIEW_NOT_APPROVED");
const cfg = parse(await readFile(join(homedir(), ".codex/cloudru/credentials.env"), "utf8"));
if (!/^[a-f0-9-]{32,40}$/.test(cfg.CLOUDRU_PROJECT_ID ?? "")) throw Error("PROJECT_ID_MISSING");
const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", timeout: 10000 });
if (git.status !== 0 || !/^[a-f0-9]{40}$/.test(git.stdout.trim())) throw Error("REVISION_MISSING");
const tagMap = {
  "gallery-origin": "stg-cdn-stable-20261012-05c5b67f",
  "feed-origin": "stg-cdn-stable-20261012-05c5b67f",
  "gallery-worker": "stg-20261012-05c5b67f",
  "feed-worker": "stg-20261012-05c5b67f",
};
const digests = {};
for (const [role, tag] of Object.entries(tagMap)) {
  const r = spawnSync(
    "docker",
    ["manifest", "inspect", "--verbose", "gafus.cr.cloud.ru/gafus-" + role + ":" + tag],
    { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  if (r.status !== 0) throw Error("REGISTRY_IMAGE_MISSING_" + role);
  const json = JSON.parse(r.stdout),
    d = (Array.isArray(json) ? json[0] : json)?.Descriptor;
  if (!/^sha256:[a-f0-9]{64}$/.test(d?.digest ?? "") || d?.platform?.architecture !== "amd64")
    throw Error("OCI_DIGEST_UNVERIFIED_" + role);
  digests[role] = d.digest;
}
const release = cloudruMediaManifests(cfg.CLOUDRU_PROJECT_ID, git.stdout.trim());
for (const item of [...release.services, ...release.jobs]) {
  const role =
    (item.name.includes("gallery") ? "gallery" : "feed") +
    "-" +
    (item.name.endsWith("-origin") ? "origin" : "worker");
  const container = item.template.containers[0],
    name = "gafus.cr.cloud.ru/gafus-" + role;
  if (!container.image.startsWith(name + ":")) throw Error("IMAGE_ROLE_MISMATCH");
  container.image = name + "@" + digests[role];
  if (
    item.name.endsWith("-origin") &&
    (item.template.scaling?.minInstanceCount !== 1 ||
      item.template.scaling?.maxInstanceCount !== 1 ||
      item.configuration?.ingress?.publiclyAccessible !== true)
  )
    throw Error("ORIGIN_MUST_BE_WARM");
  if (item.runImmediately === true) throw Error("JOB_MUST_NOT_AUTORUN");
  for (const field of container.env ?? [])
    if (!field.value?.startsWith("<secret:") && !["true", "photo", "video"].includes(field.value))
      throw Error("MANIFEST_SECRETS_MUST_BE_PLACEHOLDERS");
}
const path = "/tmp/gafus-cloudru-media-preprod-preview.json";
await writeFile(
  path,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      commit: git.stdout.trim(),
      requiresExplicitReleaseApproval: true,
      secretsIncluded: false,
      productionDeployed: false,
      preflight: {
        originWarmBeforeCdn: true,
        apiWebAndWorkerReleaseRequired: true,
        rollbackRequired: true,
      },
      ...release,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    output: path,
    services: release.services.map((x) => x.name),
    jobs: release.jobs.map((x) => x.name),
    digestsVerified: Object.keys(digests).length,
    allSecretsArePlaceholders: true,
    productionNotModified: true,
  }),
);
