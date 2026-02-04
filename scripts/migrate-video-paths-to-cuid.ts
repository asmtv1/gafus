/**
 * Миграция путей видео с UUID на CUID в CDN и БД.
 * Запуск: pnpm exec tsx scripts/migrate-video-paths-to-cuid.ts [--dry-run]
 * Требует: .env с DATABASE_URL, YC_ACCESS_KEY_ID, YC_SECRET_ACCESS_KEY
 *
 * Перед первым запуском — сделать бэкап БД.
 */

import "dotenv/config";

import { copyObjectInCDN } from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";

const DRY_RUN = process.argv.includes("--dry-run");

// Форматы base URL как в getRelativePathFromCDNUrl (cdn-upload/utils)
const CDN_BASE_URLS = [
  process.env.CDN_BASE_URL || "https://storage.yandexcloud.net/gafus-media",
  "https://gafus-media.storage.yandexcloud.net",
];
const NEW_CANONICAL_BASE = CDN_BASE_URLS[0];

/** Извлекает идентификатор папки между videocourses/ и следующим / */
function getFolderIdFromRelativePath(relativePath: string): string | null {
  const match = relativePath.match(/videocourses\/([^/]+)/);
  return match ? match[1] : null;
}

/** Извлекает расширение файла из пути (например .mp4) */
function getExtensionFromPath(relativePath: string): string {
  const base = relativePath.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx) : ".mp4";
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL не задан. Запустите с загруженным .env");
    process.exit(1);
  }

  console.log(DRY_RUN ? "[DRY-RUN] Режим без изменений\n" : "");

  const allVideos = await prisma.trainerVideo.findMany({
    select: {
      id: true,
      trainerId: true,
      relativePath: true,
      hlsManifestPath: true,
      transcodingStatus: true,
    },
  });

  const legacy = allVideos.filter((v) => {
    const folderId = getFolderIdFromRelativePath(v.relativePath);
    return folderId !== null && folderId !== v.id;
  });

  console.log(`Всего TrainerVideo: ${allVideos.length}, legacy (UUID в пути): ${legacy.length}`);

  if (legacy.length === 0) {
    console.log("Нечего мигрировать.");
    return;
  }

  for (const video of legacy) {
    const oldRelativePath = video.relativePath;

    if (video.transcodingStatus === "COMPLETED" && video.hlsManifestPath) {
      const newRelativePath = `uploads/${video.hlsManifestPath}`;
      if (DRY_RUN) {
        console.log(`[COMPLETED] ${video.id}: relativePath -> ${newRelativePath}`);
      } else {
        await prisma.trainerVideo.update({
          where: { id: video.id },
          data: { relativePath: newRelativePath },
        });
        console.log(`Обновлён COMPLETED ${video.id}`);
      }
      continue;
    }

    // PENDING / PROCESSING / FAILED — копируем оригинал в путь с CUID
    const ext = getExtensionFromPath(video.relativePath);
    const newRelativePath = `uploads/trainers/${video.trainerId}/videocourses/${video.id}/original${ext}`;

    if (DRY_RUN) {
      console.log(`[Нетранскодирован] ${video.id}: copy ${oldRelativePath} -> ${newRelativePath}`);
      continue;
    }

    try {
      await copyObjectInCDN(oldRelativePath, newRelativePath);
    } catch (err) {
      console.error(`Ошибка копирования ${video.id}:`, err);
      throw err;
    }

    await prisma.trainerVideo.update({
      where: { id: video.id },
      data: { relativePath: newRelativePath },
    });
    console.log(`Скопирован и обновлён ${video.id}`);
  }

  // 1.4 Обновление Step.videoUrl, StepTemplate.videoUrl, Course.videoUrl
  const migratedIds = new Set(legacy.map((v) => v.id));
  const migratedVideos = await prisma.trainerVideo.findMany({
    where: { id: { in: Array.from(migratedIds) } },
    select: { id: true, relativePath: true, trainerId: true, hlsManifestPath: true },
  });

  for (const video of migratedVideos) {
    const newCanonicalUrl = `${NEW_CANONICAL_BASE}/${video.relativePath}`;
    const oldRelativePath = legacy.find((l) => l.id === video.id)!.relativePath;
    const oldPathNorm = oldRelativePath.startsWith("uploads/")
      ? oldRelativePath
      : `uploads/${oldRelativePath}`;
    const oldUrlsByPath = CDN_BASE_URLS.map((base) => `${base}/${oldPathNorm}`);
    const oldUrlsByHls = video.hlsManifestPath
      ? CDN_BASE_URLS.map((base) => `${base}/uploads/${video.hlsManifestPath}`)
      : [];
    const allOldUrls = [...oldUrlsByPath, ...oldUrlsByHls];

    if (DRY_RUN) continue;

    const stepCount = await prisma.step.updateMany({
      where: { videoUrl: { in: allOldUrls } },
      data: { videoUrl: newCanonicalUrl },
    });

    const templateCount = await prisma.stepTemplate.updateMany({
      where: { videoUrl: { in: allOldUrls } },
      data: { videoUrl: newCanonicalUrl },
    });

    const courseCount = await prisma.course.updateMany({
      where: { videoUrl: { in: allOldUrls } },
      data: { videoUrl: newCanonicalUrl },
    });

    if (stepCount.count > 0 || templateCount.count > 0 || courseCount.count > 0) {
      console.log(
        `URL обновлён для видео ${video.id}: Step ${stepCount.count}, StepTemplate ${templateCount.count}, Course ${courseCount.count}`,
      );
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] Запустите без --dry-run для применения изменений.");
  } else {
    console.log("\nМиграция завершена.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
