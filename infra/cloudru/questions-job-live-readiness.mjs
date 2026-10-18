/**
 * Fail-closed, read-only release gate for the existing production Cloud.ru Job.
 * Never logs credentials, S3 objects or container environment values.
 * The CI media-prepare gate subsequently pins this same job to the release SHA.
 */
export const QUESTIONS_JOB_NAME = "gafus-questions-photo";
const EXPECTED_IMAGE = /^gafus\.cr\.cloud\.ru\/gafus-questions-worker@sha256:[a-f0-9]{64}$/;
const PROJECT_PATTERN = /^[a-f0-9-]{32,40}$/;
const REQUIRED_VARIABLES = [
  "QUESTIONS_JOB_ENABLED", "QUESTIONS_PUBLIC_S3_BUCKET",
  "CLOUDRU_S3_ENDPOINT", "CLOUDRU_S3_ACCESS_KEY_ID",
  "CLOUDRU_S3_SECRET_ACCESS_KEY",
];

export function validateQuestionsJobConfig(env = process.env) {
  if (!["true", "false"].includes(env.QUESTIONS_PUBLIC_S3_ENABLED))
    throw new Error("QUESTIONS_CUTOVER_FLAG_INVALID");
  // Explicit false is a legitimate emergency rollback to private Questions
  // media; do not prevent unrelated safe deploys during that rollback.
  if (env.QUESTIONS_PUBLIC_S3_ENABLED === "false") return false;
  if (env.QUESTIONS_CLOUD_JOB_ENABLED !== "true" ||
      env.QUESTIONS_PROCESSOR_READY !== "true")
    throw new Error("QUESTIONS_JOB_RELEASE_NOT_ENABLED");
  if (!PROJECT_PATTERN.test(env.CLOUDRU_PROJECT_ID ?? "") ||
      !env.CLOUDRU_KEY_ID || !env.CLOUDRU_KEY_SECRET)
    throw new Error("QUESTIONS_JOB_IAM_NOT_CONFIGURED");
  return true;
}

export function validateQuestionsJobResource(details, project) {
  const container = details?.template?.containers?.[0];
  const names = container?.env?.map(v => v.name) ?? [];
  if (details?.name !== QUESTIONS_JOB_NAME || details.projectId !== project ||
      !EXPECTED_IMAGE.test(container?.image ?? "") ||
      container.name !== QUESTIONS_JOB_NAME ||
      container.resources?.cpu !== "0.5" ||
      container.resources?.memory !== "1024Mi" ||
      details.template.timeout !== 240 ||
      details.template.maxRetries !== 3 ||
      details.configuration?.privileged !== false ||
      details.template.containers.length !== 1 ||
      REQUIRED_VARIABLES.some(name => !names.includes(name)) ||
      ["FAILED", "DELETING", "ERROR"].includes(String(details.status).toUpperCase()))
    throw new Error("QUESTIONS_JOB_LIVE_RESOURCE_MISMATCH");
  // Cloud.ru does not return runImmediately in its GET response. The real
  // Job was created with runImmediately:false; do not guess a GET value.
  return container.image;
}

export async function verifyQuestionsJobLive(env = process.env, transport = fetch) {
  if (!validateQuestionsJobConfig(env)) return {name: QUESTIONS_JOB_NAME, ready: false};
  const auth = await transport("https://iam.api.cloud.ru/api/v1/auth/token", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET}),
    signal: AbortSignal.timeout(14000),
  });
  if (!auth.ok) throw new Error("QUESTIONS_JOB_IAM_HTTP_" + auth.status);
  const token = (await auth.json()).access_token;
  if (!token || typeof token !== "string") throw new Error("QUESTIONS_JOB_IAM_EMPTY");
  const response = await transport("https://containers.api.cloud.ru/v2/jobs/" +
    QUESTIONS_JOB_NAME + "?projectId=" + encodeURIComponent(env.CLOUDRU_PROJECT_ID), {
    headers: {authorization: "Bearer " + token},
    signal: AbortSignal.timeout(14000),
  });
  if (!response.ok) throw new Error("QUESTIONS_JOB_GET_HTTP_" + response.status);
  const image = validateQuestionsJobResource(await response.json(), env.CLOUDRU_PROJECT_ID);
  return {name: QUESTIONS_JOB_NAME, image, ready: true};
}

if (process.argv[1]?.endsWith("/questions-job-live-readiness.mjs")) {
  verifyQuestionsJobLive().then(data =>
    console.log("QUESTIONS_JOB_LIVE_READONLY_PREFLIGHT=" +
      (data.ready ? "ready" : "disabled"), data.name))
    .catch(error => {
      console.error("QUESTIONS_JOB_RELEASE_BLOCKED",
        error instanceof Error ? error.message : "UNKNOWN");
      process.exitCode = 1;
    });
}
