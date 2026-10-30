/** Only opt-in, project-isolated registered Hono→WORK SQL→MinIO proof.
 * Never run with production credentials or by default in normal test jobs.
 */
import {describe,it} from "vitest";
const allowed=process.env.GAFUS_WEB2_WORK_MEDIA==="enabled";
(allowed?describe:describe.skip)("WEB2 registered Hono with isolated SQL and S3",()=>{
  it("two JWT owner sessions, real photo replacement and physical cleanup",async()=>{
    const {runWeb2HonoProof}=await import(
      "../../../../../scripts/refactor/web2-pet-photo-hono-work-proof"
    );
    await runWeb2HonoProof();
  },90_000);
});
