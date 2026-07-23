import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { exec } from "child_process";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { connection } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { deleteFileFromCDN, streamFileFromCDN, uploadBufferToCDN } from "@gafus/cdn-upload";
import type { VideoTranscodingJobData, VideoTranscodingResult } from "@gafus/types";
import {
  createHlsMasterPlaylist,
  createHlsRenditions,
  type HlsRendition,
} from "./video-hls-profiles";

const execAsync = promisify(exec);
const logger = createWorkerLogger("video-transcoding-worker");
const TEMP_FREE_SPACE_RESERVE_BYTES = 1024 * 1024 * 1024;
const AUDIO_BITRATE = 128_000;
const MIN_VIDEO_BITRATE = 300_000;
const OUTPUT_SIZE_SAFETY_MULTIPLIER = 1.3;
const HLS_UPLOAD_CONCURRENCY = 4;

interface VideoMetadata {
  height: number;
  durationSec: number;
  bitrate: number;
}

/**
 * Worker для транскодирования видео в HLS формат
 * - Скачивает оригинальное видео из Object Storage
 * - Определяет параметры видео через ffprobe
 * - Транскодирует в HLS до 1080p с ограниченным битрейтом
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
      const source = await streamFileFromCDN(originalPath);

      try {
        await this.ensureEnoughTempSpace(source.contentLength);
      } catch (error) {
        await source.stream.cancel().catch(() => undefined);
        throw error;
      }

      await pipeline(
        Readable.fromWeb(source.stream as NodeReadableStream),
        createWriteStream(inputPath, { flags: "wx" }),
      );
      logger.info(`✅ Видео потоково скачано, размер: ${source.contentLength} байт`);

      // 3. Определяем параметры видео через ffprobe
      const metadata = await this.getVideoMetadata(inputPath);
      logger.info("📏 Параметры исходного видео", { ...metadata });

      // 4. Транскодируем в HLS
      const sourceVideoBitrate = Math.max(metadata.bitrate - AUDIO_BITRATE, MIN_VIDEO_BITRATE);
      const renditions = createHlsRenditions(metadata.height, sourceVideoBitrate);

      await this.ensureEnoughOutputSpace(metadata.durationSec, renditions);
      logger.info("🎞️ Транскодируем в адаптивную HLS-лестницу", {
        renditions,
      });
      await this.transcodeToHLS(inputPath, hlsDir, renditions);

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

      // Исходник больше не нужен локально: освобождаем гигабайты до выгрузки HLS.
      await fs.rm(inputPath, { force: true });

      // 5. Загружаем все HLS файлы в Object Storage
      logger.info("⬆️ Загружаем HLS файлы в CDN...");
      const hlsTotalSize = await this.uploadHLSFiles(hlsDir, hlsBasePath);

      // 6. Обновляем БД (включая размер HLS файлов)
      const hlsManifestPath = `${hlsBasePath}/master.m3u8`;
      await prisma.trainerVideo.update({
        where: { id: videoId },
        data: {
          hlsManifestPath,
          thumbnailPath: thumbnailRelativePath,
          transcodingStatus: "COMPLETED",
          transcodedAt: new Date(),
          transcodingError: null,
          durationSec: Math.round(metadata.durationSec),
          fileSize: BigInt(hlsTotalSize), // Обновляем размер на размер HLS файлов
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

      // BullMQ должен увидеть ошибку, иначе attempts/backoff никогда не сработают.
      throw error;
    }
  }

  /**
   * Защищает host/overlay от заполнения исходником.
   * Место под HLS рассчитывается точнее после ffprobe.
   */
  private async ensureEnoughTempSpace(inputSizeBytes: number): Promise<void> {
    const stats = await fs.statfs(this.tmpDir);
    const availableBytes = stats.bavail * stats.bsize;
    const requiredBytes = inputSizeBytes + TEMP_FREE_SPACE_RESERVE_BYTES;

    logger.info("Проверка места для транскодирования", {
      inputSizeBytes,
      availableBytes,
      requiredBytes,
    });

    if (availableBytes < requiredBytes) {
      throw new Error(
        `Недостаточно временного места для видео: требуется ${requiredBytes} байт, доступно ${availableBytes} байт`,
      );
    }
  }

  /**
   * Определяет длительность, высоту и общий битрейт видео через ffprobe.
   */
  private async getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=height -show_entries format=duration,bit_rate -of json "${inputPath}"`,
      );

      const probe = JSON.parse(stdout) as {
        streams?: { height?: number }[];
        format?: { duration?: string; bit_rate?: string };
      };
      const height = Number(probe.streams?.[0]?.height);
      const durationSec = Number(probe.format?.duration);
      const reportedBitrate = Number(probe.format?.bit_rate);
      const inputStats = await fs.stat(inputPath);
      const bitrate =
        Number.isFinite(reportedBitrate) && reportedBitrate > 0
          ? reportedBitrate
          : (inputStats.size * 8) / durationSec;

      if (
        !Number.isFinite(height) ||
        height <= 0 ||
        !Number.isFinite(durationSec) ||
        durationSec <= 0 ||
        !Number.isFinite(bitrate) ||
        bitrate <= 0
      ) {
        throw new Error(`Некорректные параметры видео: ${stdout}`);
      }

      return { height, durationSec, bitrate };
    } catch (error) {
      logger.error("Ошибка определения параметров видео", error as Error);
      throw new Error(`Не удалось определить параметры видео: ${(error as Error).message}`);
    }
  }

  /**
   * После скачивания уточняет требование к месту по длительности и целевому битрейту.
   * Оригинал уже находится на диске, поэтому здесь резервируется место только под HLS-выход.
   */
  private async ensureEnoughOutputSpace(
    durationSec: number,
    renditions: readonly HlsRendition[],
  ): Promise<void> {
    const stats = await fs.statfs(this.tmpDir);
    const availableBytes = stats.bavail * stats.bsize;
    const estimatedOutputBytes = Math.ceil(
      ((renditions.reduce((total, rendition) => total + rendition.videoBitrate + AUDIO_BITRATE, 0) *
        durationSec) /
        8) *
        OUTPUT_SIZE_SAFETY_MULTIPLIER,
    );
    const requiredBytes = estimatedOutputBytes + TEMP_FREE_SPACE_RESERVE_BYTES;

    logger.info("Проверка места для HLS-выхода", {
      availableBytes,
      estimatedOutputBytes,
      requiredBytes,
    });

    if (availableBytes < requiredBytes) {
      throw new Error(
        `Недостаточно временного места для HLS: требуется ${requiredBytes} байт, доступно ${availableBytes} байт`,
      );
    }
  }

  /**
   * Транскодирует видео в HLS формат
   * @param inputPath - Путь к исходному видео
   * @param outputDir - Директория для HLS файлов
   * @param renditions - Набор адаптивных профилей без апскейла
   */
  private async transcodeToHLS(
    inputPath: string,
    outputDir: string,
    renditions: readonly HlsRendition[],
  ): Promise<void> {
    if (renditions.length === 0) throw new Error("Не удалось построить HLS-профили");

    const filterGraph =
      renditions.length === 1
        ? `[0:v:0]scale=-2:${renditions[0].height}[v0out]`
        : `[0:v:0]split=${renditions.length}${renditions.map((_, i) => `[v${i}]`).join("")};${renditions
            .map((rendition, i) => `[v${i}]scale=-2:${rendition.height}[v${i}out]`)
            .join(";")}`;

    const outputArguments = renditions
      .map((rendition, index) => {
        const playlistPath = path.join(outputDir, `${rendition.name}.m3u8`);
        const segmentPattern = path.join(outputDir, `${rendition.name}-segment-%03d.ts`);
        const maxRate = Math.ceil(rendition.videoBitrate * 1.2);
        const bufferSize = rendition.videoBitrate * 2;
        return `-map "[v${index}out]" -map "0:a:0?" -c:v libx264 -threads:v 1 -preset veryfast -pix_fmt yuv420p -b:v ${rendition.videoBitrate} -maxrate ${maxRate} -bufsize ${bufferSize} -force_key_frames "expr:gte(t,n_forced*4)" -sc_threshold 0 -c:a aac -b:a ${AUDIO_BITRATE} -f hls -hls_time 4 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_filename "${segmentPattern}" -hls_list_size 0 "${playlistPath}"`;
      })
      .join(" ");

    // Один decode + split экономит I/O; по одному потоку на encoder ограничивает нагрузку общего host.
    const ffmpegCommand = `nice -n 10 ionice -c 3 ffmpeg -nostdin -hide_banner -loglevel error -threads 2 -i "${inputPath}" -filter_complex "${filterGraph}" ${outputArguments}`;

    logger.info(`🔧 Выполняем FFmpeg команду: ${ffmpegCommand}`);

    try {
      const { stdout, stderr } = await execAsync(ffmpegCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB буфер для вывода
      });

      logger.info(`FFmpeg stdout: ${stdout}`);
      if (stderr) {
        logger.info(`FFmpeg stderr: ${stderr}`);
      }

      await fs.writeFile(
        path.join(outputDir, "master.m3u8"),
        createHlsMasterPlaylist(renditions, AUDIO_BITRATE),
        "utf8",
      );

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
    let nextFileIndex = 0;
    const uploadWorkers = Array.from(
      { length: Math.min(HLS_UPLOAD_CONCURRENCY, files.length) },
      async () => {
        while (nextFileIndex < files.length) {
          const file = files[nextFileIndex++]!;
          const filePath = path.join(hlsDir, file);
          const fileBuffer = await fs.readFile(filePath);
          totalSize += fileBuffer.length;

          const contentType = file.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : "video/mp2t";
          await uploadBufferToCDN(fileBuffer, `${basePath}/${file}`, contentType);
          await fs.rm(filePath, { force: true });
          logger.info(`✅ Загружен: ${file} (${fileBuffer.length} байт)`);
        }
      },
    );
    const uploadResults = await Promise.allSettled(uploadWorkers);
    const failedUpload = uploadResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failedUpload) throw failedUpload.reason;

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
