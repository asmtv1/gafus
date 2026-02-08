import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { downloadFileFromCDN, uploadBufferToCDN, deleteFileFromCDN } from "@gafus/cdn-upload";
import type { VideoTranscodingJobData, VideoTranscodingResult } from "@gafus/types";

const execAsync = promisify(exec);
const logger = createWorkerLogger("video-transcoding-worker");

/**
 * Worker для транскодирования видео в HLS формат
 * - Скачивает оригинальное видео из Object Storage
 * - Определяет разрешение через ffprobe
 * - Транскодирует в HLS с сохранением оригинального разрешения
 * - Загружает HLS файлы обратно в Object Storage
 * - Обновляет БД
 * - Удаляет оригинальное видео для экономии места
 */
class VideoTranscodingWorker {
  private worker: Worker<VideoTranscodingJobData, VideoTranscodingResult>;
  private tmpDir = "/tmp/video-transcoding";

  constructor() {
    this.worker = new Worker<VideoTranscodingJobData, VideoTranscodingResult>(
      "video-transcoding",
      this.processJob.bind(this),
      {
        connection,
        concurrency: 1, // Только одно транскодирование за раз (ресурсоёмко)
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    this.setupEventHandlers();
    this.ensureTmpDir();
  }

  /**
   * Проверяет и создаёт временную директорию если нужно
   */
  private async ensureTmpDir(): Promise<void> {
    try {
      await fs.mkdir(this.tmpDir, { recursive: true });
      logger.info(`📁 Временная директория создана: ${this.tmpDir}`);
    } catch (error) {
      logger.error("Ошибка создания временной директории", error as Error);
    }
  }

  /**
   * Основная логика обработки задачи транскодирования
   */
  private async processJob(
    job: Job<VideoTranscodingJobData, VideoTranscodingResult>,
  ): Promise<VideoTranscodingResult> {
    const { videoId, trainerId, originalPath } = job.data;

    logger.info("🎬 Начинаем транскодирование видео", {
      videoId,
      trainerId,
      originalPath,
      jobId: job.id,
    });

    // Обновляем статус в БД на PROCESSING
    await prisma.trainerVideo.update({
      where: { id: videoId },
      data: { transcodingStatus: "PROCESSING" },
    });

    const videoDir = path.join(this.tmpDir, videoId);
    const inputPath = path.join(videoDir, "original.mp4");
    const hlsDir = path.join(videoDir, "hls");

    try {
      // 1. Создаём директории
      await fs.mkdir(videoDir, { recursive: true });
      await fs.mkdir(hlsDir, { recursive: true });

      // 2. Скачиваем оригинальное видео из Object Storage
      logger.info(`⬇️ Скачиваем видео из CDN: ${originalPath}`);
      const videoBuffer = await downloadFileFromCDN(originalPath);
      await fs.writeFile(inputPath, videoBuffer);
      logger.info(`✅ Видео скачано, размер: ${videoBuffer.length} байт`);

      // 3. Определяем разрешение видео через ffprobe
      const height = await this.getVideoHeight(inputPath);
      logger.info(`📏 Разрешение видео: высота ${height}px`);

      // 4. Транскодируем в HLS
      const targetHeight = height; // Сохраняем оригинальное разрешение
      logger.info(`🎞️ Транскодируем в HLS с оригинальным разрешением (${targetHeight}p)...`);
      await this.transcodeToHLS(inputPath, hlsDir, targetHeight);

      // 4.1. Генерируем thumbnail из первого кадра
      logger.info("🖼️ Генерируем thumbnail...");
      const hlsBasePath = `trainers/${trainerId}/videocourses/${videoId}/hls`;
      let thumbnailRelativePath: string | null = null;
      try {
        const thumbnailPath = await this.generateThumbnail(inputPath, videoDir);
        thumbnailRelativePath = `${hlsBasePath}/thumbnail.jpg`;
        await this.uploadThumbnail(thumbnailPath, thumbnailRelativePath);
        // uploadBufferToCDN добавляет префикс uploads/, поэтому сохраняем путь с префиксом
        thumbnailRelativePath = `uploads/${thumbnailRelativePath}`;
      } catch (thumbnailError) {
        logger.warn("Не удалось сгенерировать thumbnail (не критично)", {
          error: thumbnailError instanceof Error ? thumbnailError.message : String(thumbnailError),
        });
        // Продолжаем без thumbnail
      }

      // 5. Загружаем все HLS файлы в Object Storage
      logger.info("⬆️ Загружаем HLS файлы в CDN...");
      const hlsTotalSize = await this.uploadHLSFiles(hlsDir, hlsBasePath);

      // 6. Обновляем БД (включая размер HLS файлов)
      const hlsManifestPath = `${hlsBasePath}/playlist.m3u8`;
      await prisma.trainerVideo.update({
        where: { id: videoId },
        data: {
          hlsManifestPath,
          thumbnailPath: thumbnailRelativePath,
          transcodingStatus: "COMPLETED",
          transcodedAt: new Date(),
          transcodingError: null,
          fileSize: hlsTotalSize, // Обновляем размер на размер HLS файлов
        },
      });

      logger.success("✅ Транскодирование завершено", { videoId, hlsManifestPath });

      // 7. Удаляем оригинальное видео из Object Storage для экономии места
      try {
        await deleteFileFromCDN(originalPath);
        logger.info(`🗑️ Оригинальное видео удалено: ${originalPath}`);
      } catch (error) {
        logger.warn("⚠️ Не удалось удалить оригинальное видео (не критично)", {
          error: (error as Error).message,
        });
      }

      // 8. Очищаем временные файлы
      await this.cleanupTempFiles(videoDir);

      return {
        success: true,
        hlsManifestPath,
      };
    } catch (error) {
      logger.error("Ошибка транскодирования видео", error as Error, {
        videoId,
        originalPath,
        jobId: job.id,
      });

      // Обновляем статус в БД на FAILED
      await prisma.trainerVideo.update({
        where: { id: videoId },
        data: {
          transcodingStatus: "FAILED",
          transcodingError: (error as Error).message,
        },
      });

      // Очищаем временные файлы даже при ошибке
      await this.cleanupTempFiles(videoDir);

      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Определяет высоту видео через ffprobe
   */
  private async getVideoHeight(inputPath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "${inputPath}"`,
      );

      const height = parseInt(stdout.trim(), 10);

      if (isNaN(height) || height <= 0) {
        throw new Error(`Некорректное разрешение видео: ${stdout}`);
      }

      return height;
    } catch (error) {
      logger.error("Ошибка определения разрешения видео", error as Error);
      throw new Error(`Не удалось определить разрешение видео: ${(error as Error).message}`);
    }
  }

  /**
   * Транскодирует видео в HLS формат
   * @param inputPath - Путь к исходному видео
   * @param outputDir - Директория для HLS файлов
   * @param targetHeight - Целевая высота (оригинальное разрешение)
   */
  private async transcodeToHLS(
    inputPath: string,
    outputDir: string,
    targetHeight: number,
  ): Promise<void> {
    const playlistPath = path.join(outputDir, "playlist.m3u8");
    const segmentPattern = path.join(outputDir, "segment-%03d.ts");

    // Всегда используем оригинальное разрешение (без scale фильтра)
    // Ограничиваем до 2 потоков и снижаем приоритет, чтобы не блокировать другие задачи
    const ffmpegCommand = `nice -n 10 ionice -c 3 ffmpeg -threads 2 -i "${inputPath}" -c:v libx264 -c:a aac -hls_time 6 -hls_playlist_type vod -hls_segment_filename "${segmentPattern}" -hls_list_size 0 "${playlistPath}"`;

    logger.info(`🔧 Выполняем FFmpeg команду: ${ffmpegCommand}`);

    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB буфер для вывода
      });

      logger.info(`FFmpeg stdout: ${stdout}`);
      if (stderr) {
        logger.info(`FFmpeg stderr: ${stderr}`);
      }

      logger.success("✅ Транскодирование в HLS завершено");
    } catch (error) {
      logger.error("Ошибка выполнения FFmpeg", error as Error);
      throw new Error(`FFmpeg ошибка: ${(error as Error).message}`);
    }
  }

  /**
   * Загружает все HLS файлы (манифест и сегменты) в Object Storage
   * @returns Суммарный размер всех загруженных файлов в байтах
   */
  private async uploadHLSFiles(hlsDir: string, basePath: string): Promise<number> {
    const files = await fs.readdir(hlsDir);

    logger.info(`📦 Загружаем ${files.length} HLS файлов в CDN...`);

    let totalSize = 0;

    for (const file of files) {
      const filePath = path.join(hlsDir, file);
      const fileBuffer = await fs.readFile(filePath);
      totalSize += fileBuffer.length;

      // Определяем MIME тип
      const contentType = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";

      const relativePath = `${basePath}/${file}`;

      await uploadBufferToCDN(fileBuffer, relativePath, contentType);

      logger.info(`✅ Загружен: ${file} (${fileBuffer.length} байт)`);
    }

    logger.success(
      `✅ Все ${files.length} HLS файлов загружены в CDN, общий размер: ${totalSize} байт`,
    );
    return totalSize;
  }

  /**
   * Генерирует thumbnail из первого кадра видео
   * @param inputPath - Путь к исходному видео
   * @param outputDir - Директория для сохранения thumbnail
   * @returns Путь к созданному thumbnail файлу
   */
  private async generateThumbnail(inputPath: string, outputDir: string): Promise<string> {
    const thumbnailPath = path.join(outputDir, "thumbnail.jpg");

    // Извлекаем первый кадр и масштабируем до 320px ширины (высота автоматически)
    // -ss 0.1 - берем кадр на 0.1 секунде (избегаем черного кадра)
    // -vframes 1 - только один кадр
    // -vf "scale=320:-1" - масштабируем до ширины 320px, высота автоматически
    // -q:v 2 - качество JPEG (2 = высокое качество, но небольшой размер)
    // Ограничиваем потоки и снижаем приоритет
    const ffmpegCommand = `nice -n 10 ionice -c 3 ffmpeg -threads 2 -i "${inputPath}" -ss 0.1 -vframes 1 -vf "scale=320:-1" -q:v 2 "${thumbnailPath}"`;

    logger.info(`🔧 Генерируем thumbnail: ${ffmpegCommand}`);

    try {
      await execAsync(ffmpegCommand, {
        maxBuffer: 10 * 1024 * 1024,
      });
      logger.success(`✅ Thumbnail создан: ${thumbnailPath}`);
      return thumbnailPath;
    } catch (error) {
      logger.error("Ошибка генерации thumbnail", error as Error);
      throw new Error(`FFmpeg ошибка при генерации thumbnail: ${(error as Error).message}`);
    }
  }

  /**
   * Загружает thumbnail в Object Storage
   */
  private async uploadThumbnail(thumbnailPath: string, relativePath: string): Promise<void> {
    const thumbnailBuffer = await fs.readFile(thumbnailPath);
    await uploadBufferToCDN(thumbnailBuffer, relativePath, "image/jpeg");
    logger.info(`✅ Thumbnail загружен: ${relativePath} (${thumbnailBuffer.length} байт)`);
  }

  /**
   * Удаляет временные файлы
   */
  private async cleanupTempFiles(videoDir: string): Promise<void> {
    try {
      await fs.rm(videoDir, { recursive: true, force: true });
      logger.info(`🗑️ Временные файлы удалены: ${videoDir}`);
    } catch (error) {
      logger.warn("⚠️ Не удалось удалить временные файлы (не критично)", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Настройка обработчиков событий worker'а
   */
  private setupEventHandlers(): void {
    this.worker.on("completed", (job, result) => {
      if (result.success) {
        logger.success("✅ Задача транскодирования завершена", {
          jobId: job.id,
          videoId: job.data.videoId,
          hlsManifestPath: result.hlsManifestPath,
        });
      }
    });

    this.worker.on("failed", (job, err) => {
      logger.error("❌ Задача транскодирования провалилась", err as Error, {
        jobId: job?.id,
        videoId: job?.data?.videoId,
        attempts: job?.attemptsMade,
      });
    });

    this.worker.on("error", (err) => {
      logger.error("❌ Ошибка worker'а транскодирования", err as Error);
    });

    logger.info("🚀 Video Transcoding Worker запущен");
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info("Video Transcoding Worker остановлен");
  }
}

// Создаём и экспортируем worker
const videoTranscodingWorker = new VideoTranscodingWorker();

export default videoTranscodingWorker;
