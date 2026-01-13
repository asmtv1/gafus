#!/usr/bin/env tsx

/**
 * Скрипт миграции существующих видео в HLS формат
 * 
 * Использование:
 * pnpm tsx scripts/migrate-videos-to-hls.ts [--batch-size=10] [--dry-run]
 */

import { prisma } from "@gafus/prisma";
import { videoTranscodingQueue } from "@gafus/queues";
import type { VideoTranscodingJobData } from "@gafus/types";

// Парсим аргументы командной строки
const args = process.argv.slice(2);
const batchSize = parseInt(
  args.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1] || "10",
  10
);
const isDryRun = args.includes("--dry-run");

console.log("🎬 Миграция видео в HLS формат");
console.log(`Размер batch: ${batchSize}`);
console.log(`Dry run: ${isDryRun ? "Да (без реальных изменений)" : "Нет"}\n`);

async function migrateVideos() {
  try {
    // Показываем начальную статистику
    const totalToMigrate = await prisma.trainerVideo.count({
      where: {
        hlsManifestPath: null,
        transcodingStatus: {
          not: "COMPLETED",
        },
      },
    });

    if (totalToMigrate === 0) {
      console.log("✅ Все видео уже мигрированы!");
      return;
    }

    console.log(`📦 Всего видео для миграции: ${totalToMigrate}`);
    console.log(`📊 Обработка порциями по ${batchSize} видео\n`);

    // Показываем общую статистику до миграции
    const initialStats = await prisma.trainerVideo.groupBy({
      by: ["transcodingStatus"],
      _count: true,
    });

    console.log(`📈 Статистика до миграции:`);
    initialStats.forEach((stat) => {
      console.log(`  ${stat.transcodingStatus}: ${stat._count} видео`);
    });
    console.log();

    let totalProcessed = 0;
    let batchNumber = 1;

    // Обрабатываем видео порциями в цикле
    while (true) {
      const oldVideos = await prisma.trainerVideo.findMany({
        where: {
          hlsManifestPath: null,
          transcodingStatus: {
            not: "COMPLETED",
          },
        },
        take: batchSize,
        select: {
          id: true,
          trainerId: true,
          relativePath: true,
          originalName: true,
          transcodingStatus: true,
        },
      });

      if (oldVideos.length === 0) {
        break;
      }

      console.log(`\n🔄 Обработка порции ${batchNumber} (${oldVideos.length} видео):`);
      console.log(`   Прогресс: ${totalProcessed + oldVideos.length} / ${totalToMigrate}\n`);

      for (const video of oldVideos) {
        console.log(`- ${video.originalName} (ID: ${video.id})`);
        console.log(`  Статус: ${video.transcodingStatus}`);
        console.log(`  Путь: ${video.relativePath}`);

        if (!isDryRun) {
          // Обновляем статус на PENDING
          await prisma.trainerVideo.update({
            where: { id: video.id },
            data: {
              transcodingStatus: "PENDING",
            },
          });

          // Добавляем задачу транскодирования в очередь
          const jobData: VideoTranscodingJobData = {
            videoId: video.id,
            trainerId: video.trainerId,
            originalPath: video.relativePath,
          };

          await videoTranscodingQueue.add("transcode-video", jobData, {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          });

          console.log(`  ✅ Добавлено в очередь транскодирования`);
        } else {
          console.log(`  ⏭️  Пропущено (dry-run)`);
        }
        console.log();
      }

      totalProcessed += oldVideos.length;
      batchNumber++;

      if (!isDryRun) {
        console.log(`✅ Порция ${batchNumber - 1} обработана. Всего обработано: ${totalProcessed} / ${totalToMigrate}`);
      }
    }

    if (!isDryRun) {
      console.log(`\n✅ Все ${totalProcessed} видео добавлено в очередь транскодирования`);
      console.log(`\n📊 Проверить статус можно в Bull Board`);
    } else {
      console.log(`\n⚠️  Dry-run завершён. Запустите без --dry-run для реальной миграции`);
    }

    // Показываем финальную статистику
    const finalStats = await prisma.trainerVideo.groupBy({
      by: ["transcodingStatus"],
      _count: true,
    });

    console.log(`\n📈 Статистика после миграции:`);
    finalStats.forEach((stat) => {
      console.log(`  ${stat.transcodingStatus}: ${stat._count} видео`);
    });
  } catch (error) {
    console.error("❌ Ошибка миграции:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем миграцию
migrateVideos()
  .then(() => {
    console.log("\n✅ Миграция завершена");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Критическая ошибка:", error);
    process.exit(1);
  });
