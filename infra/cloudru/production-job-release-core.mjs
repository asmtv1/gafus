import { CLOUDRU_PRODUCTION_JOBS, CLOUDRU_PROJECTS, CLOUDRU_JOB_RUNTIME, imageRepository, validateProductionInventory } from "./production-job-inventory.mjs";

const digestPattern = /^sha256:[a-f0-9]{64}$/;
export function platformDigest(manifest) {
  const descriptors = Array.isArray(manifest) ? manifest : [manifest];
  const amd64 = descriptors.filter((x) => x?.Descriptor?.platform?.os === "linux" &&
    x?.Descriptor?.platform?.architecture === "amd64" &&
    digestPattern.test(x?.Descriptor?.digest ?? ""));
  if (amd64.length !== 1) throw Error("OCI_AMD64_DIGEST_AMBIGUOUS");
  return amd64[0].Descriptor.digest;
}
export function imageReferencesForSha(sha, resolveDigest, jobs = CLOUDRU_PRODUCTION_JOBS) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error("INVALID_CLOUDRU_RELEASE_SHA");
  validateProductionInventory(jobs);
  const out = {};
  for (const job of jobs) {
    const repo = imageRepository(job);
    if (out[job.imageRole]) continue;
    const digest = resolveDigest(repo + ":" + sha);
    if (!digestPattern.test(digest)) throw Error("INVALID_IMAGE_DIGEST_" + job.imageRole);
    out[job.imageRole] = repo + "@" + digest;
  }
  return out;
}
const safeTemplate = (job) => {
  const copy = structuredClone(job.template);
  if (!copy || !Array.isArray(copy.containers) || copy.containers.length !== 1 ||
      typeof copy.containers[0]?.image !== "string") throw Error("INVALID_CLOUDRU_JOB_TEMPLATE_" + job.name);
  const bindings = copy.containers[0].env;
  if (bindings !== undefined && !Array.isArray(bindings))
    throw Error("INVALID_CLOUDRU_JOB_ENV_" + job.name);
  for (const binding of bindings ?? []) {
    if (!binding?.name || (binding.value === undefined && binding.valueFrom === undefined &&
        binding.secretRef === undefined) ||
        (typeof binding.value === "string" && /^(?:\*{3,}|\[?redacted\]?|<secret>)$/i.test(binding.value)))
      throw Error("CLOUDRU_JOB_ENV_UNSAFE_TO_ROUNDTRIP_" + job.name);
  }
  return copy;
};
function normalized(template) {
  const copy = structuredClone(template);
  for (const c of copy.containers) delete c.image;
  return copy;
}
function preservedState(job) {
  return {
    runImmediately: job.runImmediately,
    description: job.description,
    configuration: job.configuration,
    template: normalized(safeTemplate(job)),
  };
}
/** READ-ONLY all-or-nothing inventory pass, before ANY cloud mutation. */
export async function preflightJobs({ jobs = CLOUDRU_PRODUCTION_JOBS, images, list, get, readOnly = false, allowChat2MissingRuntime = false }) {
  validateProductionInventory(jobs);
  const inventories = {};
  for (const job of jobs) {
    const scope = job.project;
    const group = scope + ":" + job.iamVersion;
    if (inventories[group]) continue;
    const projectId = CLOUDRU_PROJECTS[scope].projectId;
    const rows = await list(scope, projectId, job.iamVersion);
    if (!Array.isArray(rows) || rows.length >= 100) throw Error("CLOUDRU_INVENTORY_INCOMPLETE_" + group);
    const names = rows.map((x) => x.name);
    if (new Set(names).size !== names.length) throw Error("DUPLICATE_CLOUDRU_REMOTE_JOB_" + group);
    inventories[group] = rows;
  }
  const snapshots = [];
  for (const job of jobs) {
    const projectId = CLOUDRU_PROJECTS[job.project].projectId;
    if (!inventories[job.project + ":" + job.iamVersion].some((x) => x.name === job.name))
      throw Error("CLOUDRU_JOB_MISSING_" + job.name);
    const current = await get(job.project, projectId, job.name, job.iamVersion);
    if (current?.name !== job.name || current?.projectId !== projectId)
      throw Error("CLOUDRU_JOB_PROJECT_MISMATCH_" + job.name);
    if (current.status !== "ready") throw Error("CLOUDRU_JOB_NOT_READY_" + job.name);
    const currentTemplate = safeTemplate(current);
    const runContract = CLOUDRU_JOB_RUNTIME[job.imageRole];
    const runtimeEnv = new Map((currentTemplate.containers[0].env ?? []).map((x) => [x.name, x]));
    // Newly published Chat2 Jobs may be dormant before their first Hono V2
    // release. Only the four exact missing credentials/backend parameters can
    // be added during a guarded, post-Backend cutover; all other runtime keys
    // (including work root, kind, S3 bucket) remain mandatory.
    const chat2Bootstrap = readOnly && allowChat2MissingRuntime &&
      (job.imageRole === "chat-photo" || job.imageRole === "chat-video");
    const bootstrapFields = new Set(["CHAT2_S3_ACCESS_KEY_ID", "CHAT2_S3_SECRET_ACCESS_KEY",
      "CHAT2_INTERNAL_BASE_URL", "CHAT2_INTERNAL_HMAC_SECRET"]);
    for (const name of runContract.required) {
      const entry = runtimeEnv.get(name);
      if (!entry || (!entry.value && !entry.valueFrom && !entry.secretRef)) {
        if (chat2Bootstrap && bootstrapFields.has(name)) continue;
        throw Error("CLOUDRU_JOB_RUNTIME_ENV_MISSING_" + job.name + "_" + name);
      }
    }
    const exact = { ...runContract.exact };
    // Existing Chat2 Jobs start dormant while the first compatible Backend is
    // being deployed. Only the explicitly authorized read-only bootstrap may
    // accept this state; verification and mutation contracts remain strict.
    if (chat2Bootstrap && runtimeEnv.get("CHAT2_JOB_ENABLED")?.value === "false")
      exact.CHAT2_JOB_ENABLED = "false";
    // An application release must be able to deploy a compatible Backend first.
    // Questions may be present but deliberately dormant until signed Hono V2
    // routes and the SAME HMAC are independently verified. Mutation preflights
    // keep the strict active-job contract.
    if (readOnly && job.imageRole === "questions-photo" &&
        runtimeEnv.get("QUESTIONS_V2_JOB_ENABLED")?.value === "false") {
      exact.QUESTIONS_V2_JOB_ENABLED = "false";
      if (runtimeEnv.get("QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED")?.value !== "false")
        throw Error("CLOUDRU_QUESTIONS_DORMANT_VERIFICATION_MUST_BE_FALSE");
      const baseUrl = runtimeEnv.get("QUESTIONS_V2_INTERNAL_BASE_URL")?.value;
      if (baseUrl !== "https://api.gafus.ru/" ||
          runtimeEnv.get("QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME")?.value !== "api.gafus.ru")
        throw Error("CLOUDRU_QUESTIONS_DORMANT_BACKEND_HOST_MISMATCH");
    }
    if (job.imageRole === "feed-worker")
      exact.FEED_WORKER_TYPE = job.name.includes("-video") ? "video" : "photo";
    for (const [name, expected] of Object.entries(exact)) {
      if (runtimeEnv.get(name)?.value !== expected)
        throw Error("CLOUDRU_JOB_RUNTIME_ENV_MISMATCH_" + job.name + "_" + name);
    }
    // Cloud.ru GET omits runImmediately; only mutation preflights require an explicit false.
    // Read-only audits never PATCH and must not fail on this omitted response field.
    if (!readOnly && current.runImmediately !== false)
      throw Error("CLOUDRU_JOB_AUTORUN_UNSAFE_" + job.name);
    for (const name of ["GALLERY_INTERNAL_BASE_URL", "FEED_INTERNAL_BASE_URL", "QUESTIONS_V2_INTERNAL_BASE_URL", "CHAT2_INTERNAL_BASE_URL"]) {
      const url = runtimeEnv.get(name)?.value;
      if (url && (/trycloudflare\.com/i.test(url) || /stage-core-not-configured\.invalid/i.test(url) || /localhost|127\.0\.0\.1/.test(url)))
        throw Error("CLOUDRU_JOB_TEMPORARY_BACKEND_" + job.name);
    }
    const currentImage = current.template.containers[0].image;
    if (!/@sha256:[a-f0-9]{64}$/.test(currentImage))
      throw Error("CLOUDRU_JOB_PREVIOUS_DIGEST_NOT_PINNED_" + job.name);
    const expectedRepo = imageRepository(job);
    if (!current.template.containers[0].image.startsWith(expectedRepo + "@") &&
        !current.template.containers[0].image.startsWith(expectedRepo + ":"))
      throw Error("CLOUDRU_JOB_IMAGE_ROLE_MISMATCH_" + job.name);
    if (images && !images[job.imageRole]?.startsWith(expectedRepo + "@"))
      throw Error("CLOUDRU_RELEASE_IMAGE_MISSING_" + job.imageRole);
    snapshots.push({ ...job, projectId, before: current, targetImage: images?.[job.imageRole] ?? currentImage });
  }
  return snapshots;
}
/** Only image changes. Never recreate Jobs, clear env, or alter resource quotas. */
export function imageOnlyPatch(snapshot) {
  const current = snapshot.before;
  const template = safeTemplate(current);
  template.containers[0].image = snapshot.targetImage;
  return {
    name: snapshot.name, projectId: snapshot.projectId,
    description: current.description,
    runImmediately: current.runImmediately,
    configuration: structuredClone(current.configuration),
    template,
  };
}
export async function applyJobs(snapshots, { get, patch, wait = async () => {} }) {
  const updates = [];
  for (const snapshot of snapshots) {
    const current = await get(snapshot.project, snapshot.projectId, snapshot.name, snapshot.iamVersion);
    if (JSON.stringify(current.template) !== JSON.stringify(snapshot.before.template) ||
        JSON.stringify(preservedState(current)) !== JSON.stringify(preservedState(snapshot.before)))
      throw Error("CLOUDRU_JOB_CHANGED_SINCE_PREFLIGHT_" + snapshot.name);
    if (current.template.containers[0].image !== snapshot.targetImage) {
      await patch(snapshot.project, snapshot.projectId, snapshot.name, imageOnlyPatch(snapshot), snapshot.iamVersion);
      updates.push(snapshot.name);
    }
    let verified = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const after = await get(snapshot.project, snapshot.projectId, snapshot.name, snapshot.iamVersion);
      if (after?.name !== snapshot.name || after?.projectId !== snapshot.projectId)
        throw Error("CLOUDRU_JOB_POSTUPDATE_PROJECT_MISMATCH_" + snapshot.name);
      if (after.template?.containers?.[0]?.image === snapshot.targetImage) {
        if (JSON.stringify(preservedState(after)) !==
            JSON.stringify(preservedState(snapshot.before)))
          throw Error("CLOUDRU_JOB_NON_IMAGE_DRIFT_" + snapshot.name);
        verified = true;
        break;
      }
      await wait(attempt);
    }
    if (!verified) throw Error("CLOUDRU_JOB_DIGEST_NOT_APPLIED_" + snapshot.name);
  }
  return updates;
}

/** Best-effort reverse rollback after a partial release. Never recreate a Job,
 * and never overwrite an independently changed live template. */
export async function rollbackJobs(snapshots, { get, patch, wait = async () => {} }) {
  const failures = [];
  for (const s of [...snapshots].reverse()) {
    try {
      const actual = await get(s.project, s.projectId, s.name, s.iamVersion);
      if (actual?.name !== s.name || actual?.projectId !== s.projectId)
        throw Error('ROLLBACK_IDENTITY_MISMATCH');
      const image = actual.template?.containers?.[0]?.image;
      if (image === s.before.template.containers[0].image) continue;
      if (image !== s.targetImage || JSON.stringify(preservedState(actual)) !==
          JSON.stringify(preservedState(s.before)))
        throw Error('ROLLBACK_UNSAFE_CONCURRENT_DRIFT');
      await patch(s.project, s.projectId, s.name, {
        ...imageOnlyPatch(s), template: safeTemplate(s.before),
      }, s.iamVersion);
      let restored = false;
      for (let n = 0; n < 12; n++) {
        if ((await get(s.project, s.projectId, s.name, s.iamVersion))?.template?.containers?.[0]?.image ===
            s.before.template.containers[0].image) { restored = true; break; }
        await wait(n);
      }
      if (!restored) throw Error('ROLLBACK_DIGEST_NOT_RESTORED');
    } catch (err) { failures.push(s.name + ':' + err.message); }
  }
  if (failures.length) throw Error('CLOUDRU_PARTIAL_ROLLBACK_FAILED_' + failures.join(','));
}
