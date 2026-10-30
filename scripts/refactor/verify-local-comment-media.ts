/** Read-only local media acceptance: owner-visible comment DTO and signed WebP delivery. */
import { realpathSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createFeedSocial } from "../../packages/core/src/services/feed/social";
import { createFeedStorage } from "../../packages/feed-storage/src/storage";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";
const e = process.env;
const u = new URL(e.DATABASE_URL ?? "http://invalid");
if (realpathSync(process.cwd()) !== "/Users/asmtv1/Desktop/gafus-refactor" ||
    u.hostname !== "127.0.0.1" || u.port !== "55921" ||
    u.pathname !== "/gafus_refactor_real_work_20261024" ||
    e.GAFUS_LOCAL_ISOLATED_API !== "1" ||
    e.NODE_ENV !== "development" ||
    e.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
    e.GAFUS_ISOLATED_S3_ENDPOINT !== "http://127.0.0.1:9000")
  throw Error("READ_ONLY_COMMENT_MEDIA_LOCAL_GUARD");
const storageConfig = isolatedNonprodS3Config("feed", e);
if (!storageConfig || storageConfig.bucket !== "gafus-refactor-feed-test")
  throw Error("READ_ONLY_COMMENT_MEDIA_STORAGE_GUARD");
async function main() {
  const db = new PrismaClient();
  try {
    const rows = await db.feedCommentMedia.findMany({
      where: { media: { status: "ready" }, comment: { deletedAt: null, moderationState: "visible" } },
      orderBy: { media: { createdAt: "desc" } },
      take: 4,
      include: { comment: { select: { id: true, authorId: true } } },
    });
    const storage = createFeedStorage({
      enabled: true, isolatedNonprod: true, ...storageConfig, cdnBaseUrl: "", cdnSecret: "",
    });
    const social = createFeedSocial({ db, storage, enabled: () => true });
    let verified = 0;
    for (const row of rows) {
      const dto = await social.getComment(row.comment.authorId, row.comment.id);
      const media = dto.media?.find(item => item.id === row.mediaId);
      if (!media || media.status !== "ready" || !media.thumbUrl)
        throw Error("READY_COMMENT_DTO_MISSING_WEBP");
      const url = new URL(media.thumbUrl);
      if (url.origin !== "http://127.0.0.1:9000" ||
          !url.pathname.startsWith("/gafus-refactor-feed-test/media/v2/"))
        throw Error("LOCAL_COMMENT_SIGNED_URL_GUARD");
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (response.status !== 200 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
          bytes.toString("ascii", 8, 12) !== "WEBP")
        throw Error("LOCAL_COMMENT_WEBP_READ_FAILED");
      verified++;
    }
    console.log("LOCAL_COMMENT_MEDIA_DTO_SIGNED_WEBP_PASS", verified);
    if (verified < 2) throw Error("REQUIRES_TWO_READY_COMMENTS");
  } finally {
    await db.$disconnect();
  }
}
void main().catch(error => {
  console.error("LOCAL_COMMENT_MEDIA_VERIFY_FAILED", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
