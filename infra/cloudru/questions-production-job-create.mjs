/**
 * Narrow Cloud.ru production write: create exactly gafus-questions-photo.
 * Never execute it, never patch/delete existing resources, never touch app/deploy flags.
 * GitHub Actions injects secrets; avoid any logging of tokens/request bodies.
 */
const NAME = "gafus-questions-photo";
const REVISION = "dbeba449619f45b981e95cf82f5eb4380644dca5";
const IMAGE = "gafus.cr.cloud.ru/gafus-questions-worker:" + REVISION;
const env = process.env;
const PROJECT = env.CLOUDRU_PROJECT_ID;
if (!/^[a-f0-9-]{32,40}$/.test(PROJECT ?? "") ||
    !env.CLOUDRU_KEY_ID || !env.CLOUDRU_KEY_SECRET ||
    !env.CLOUDRU_S3_ACCESS_KEY_ID || !env.CLOUDRU_S3_SECRET_ACCESS_KEY)
  throw new Error("QUESTIONS_JOB_REQUIRED_SECRETS_NOT_CONFIGURED");
const timeout = 22000;
async function request(url, options) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(timeout)});
  if (!response.ok) throw Error("QUESTIONS_JOB_API_HTTP_" + response.status);
  return response.json();
}
const tokenData = await request("https://iam.api.cloud.ru/api/v1/auth/token", {
  method: "POST", headers: {"content-type": "application/json"},
  body: JSON.stringify({keyId: env.CLOUDRU_KEY_ID, secret: env.CLOUDRU_KEY_SECRET}),
});
const token = tokenData.access_token;
if (!token || typeof token !== "string") throw Error("QUESTIONS_JOB_NO_TOKEN");
const auth = {authorization: "Bearer " + token};
const listUrl = "https://containers.api.cloud.ru/v2/jobs?projectId=" +
  encodeURIComponent(PROJECT) + "&pageSize=100";
const listing = await request(listUrl, {headers: auth});
if (!Array.isArray(listing.data)) throw Error("QUESTIONS_JOB_LIST_INVALID");
if (listing.data.some(job => job.name === NAME))
  throw Error("QUESTIONS_JOB_ALREADY_EXISTS_REFUSE_OVERWRITE");

const config = {
  name: NAME,
  projectId: PROJECT,
  description: "GAFUS Questions production photo processor; private source to private WebP staging",
  runImmediately: false,
  configuration: {privileged: false},
  template: {
    timeout: 240,
    maxRetries: 3,
    containers: [{
      name: NAME,
      image: IMAGE,
      resources: {cpu: "0.5", memory: "1024Mi"},
      env: [
        {name: "QUESTIONS_JOB_ENABLED", value: "true"},
        {name: "QUESTIONS_PUBLIC_S3_BUCKET", value: "gafus-questions-public"},
        {name: "CLOUDRU_S3_ENDPOINT", value: "https://s3.cloud.ru"},
        {name: "CLOUDRU_S3_ACCESS_KEY_ID", value: env.CLOUDRU_S3_ACCESS_KEY_ID},
        {name: "CLOUDRU_S3_SECRET_ACCESS_KEY", value: env.CLOUDRU_S3_SECRET_ACCESS_KEY},
      ],
    }],
  },
};
if (config.runImmediately !== false || config.template.containers.length !== 1 ||
    config.template.containers[0].name !== NAME ||
    config.template.containers[0].image !== IMAGE)
  throw new Error("QUESTIONS_JOB_UNSAFE_SPEC");
const created = await request("https://containers.api.cloud.ru/v2/jobs/", {
  method: "POST",
  headers: {...auth, "content-type": "application/json"},
  body: JSON.stringify(config),
});
console.log("PRODUCTION_QUESTIONS_JOB_CREATE_ACCEPTED", {
  name: NAME, image: IMAGE, operationIdPresent: Boolean(created.id),
  runImmediately: false,
});
for (let n=0;n<15;n++) {
  const found = await request(listUrl, {headers: auth});
  const row=found.data?.find(entry => entry.name===NAME);
  if (row) {
    const details = await request("https://containers.api.cloud.ru/v2/jobs/" + NAME +
      "?projectId=" + encodeURIComponent(PROJECT), {headers: auth});
    const container = details?.template?.containers?.[0];
    if (details.name !== NAME || details.projectId !== PROJECT ||
        details.runImmediately !== false || container?.image !== IMAGE ||
        container?.name !== NAME)
      throw new Error("QUESTIONS_JOB_VERIFY_MISMATCH");
    console.log("PRODUCTION_QUESTIONS_JOB_VERIFIED", {
      name: NAME, image: container.image,
      runImmediately: details.runImmediately,
      cpu: container.resources?.cpu, memory: container.resources?.memory,
      envNames: container.env?.map(v => v.name),
    });
    process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
}
throw Error("QUESTIONS_JOB_PROVISION_IN_PROGRESS_NOT_YET_VISIBLE");
