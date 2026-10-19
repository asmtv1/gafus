import { S3Client } from "@aws-sdk/client-s3";
import { createQuestionsCloudProcessor, QUESTION_JOB_BUCKET } from "./worker.js";

async function main() {
  const env = process.env;
  if (env.QUESTIONS_JOB_ENABLED !== "true") return;
  if (env.QUESTIONS_PUBLIC_S3_BUCKET !== QUESTION_JOB_BUCKET ||
      env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
      !env.CLOUDRU_S3_ACCESS_KEY_ID || !env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw new Error("QUESTIONS_JOB_CONFIGURATION_UNSAFE");
  const s3 = new S3Client({
    endpoint: "https://s3.cloud.ru", region: "ru-central-1", forcePathStyle: true,
    maxAttempts: 2, credentials: {
      accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    },
  });
  try {
    console.log(JSON.stringify({event: "questions_invocation_start",
      processUptimeMs: Math.round(process.uptime() * 1000)}));
    const {processed, rejected} = await createQuestionsCloudProcessor(s3).run(5);
    console.log("QUESTIONS_CLOUD_JOB_RUN", {processed, rejected});
  } finally { s3.destroy(); }
}
main().catch(() => {
  console.error("QUESTIONS_CLOUD_JOB_FAILED");
  process.exitCode = 1;
});
