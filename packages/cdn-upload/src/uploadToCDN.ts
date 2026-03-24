import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createTrainerPanelLogger } from "@gafus/logger";
import { Readable } from "stream";

const logger = createTrainerPanelLogger("cdn-upload");

function toLogError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Функция для очистки имени файла от недопустимых символов
function sanitizeFileName(fileName: string): string {
  // Убираем недопустимые символы для HTTP заголовков
  // Разрешены только: A-Z, a-z, 0-9, дефис, подчеркивание, точка
  return fileName
    .replace(/[^a-zA-Z0-9\-_.]/g, "_") // Заменяем недопустимые символы на подчеркивание
    .replace(/_{2,}/g, "_") // Убираем множественные подчеркивания
    .substring(0, 100); // Ограничиваем длину
}

const YC_ACCESS_KEY_ID = process.env.YC_ACCESS_KEY_ID;
const YC_SECRET_ACCESS_KEY = process.env.YC_SECRET_ACCESS_KEY;

// Мягкая проверка: просто логируем предупреждение один раз, без падения приложения.
let hasCheckedCredentials = false;
function checkCredentials() {
  if (hasCheckedCredentials) return;
  hasCheckedCredentials = true;

  if (!YC_ACCESS_KEY_ID || !YC_SECRET_ACCESS_KEY) {
    logger.warn(
      "YC_ACCESS_KEY_ID / YC_SECRET_ACCESS_KEY не заданы. Используются dev-only-fallback креды.",
    );
  }
}

// Конфигурация для Yandex Object Storage (S3-совместимый)
const s3Client = new S3Client({
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  credentials: {
    accessKeyId: YC_ACCESS_KEY_ID || "dev-only-fallback",
    secretAccessKey: YC_SECRET_ACCESS_KEY || "dev-only-fallback",
  },
});

export async function uploadFileToCDN(file: File, relativePath: string): Promise<string> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";
    const key = `uploads/${relativePath}`;

    // Конвертируем File в Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info(`🔄 Загружаем файл в CDN: ${relativePath}`);

    // Создаем команду для загрузки
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ContentLength: file.size,
      // Настройки кэширования
      CacheControl: "public, max-age=31536000", // 1 год
      Metadata: {
        "original-name": sanitizeFileName(file.name),
        "upload-timestamp": Date.now().toString(),
      },
    });

    // Выполняем загрузку с retry логикой
    await uploadWithRetry(command, 3);

    logger.info(`✅ Файл загружен в CDN: ${relativePath}`);

    return `https://storage.yandexcloud.net/gafus-media/uploads/${relativePath}`;
  } catch (error) {
    logger.error("Ошибка загрузки в CDN", toLogError(error), { relativePath });
    throw error;
  }
}

// Функция для повторных попыток загрузки
async function uploadWithRetry(command: PutObjectCommand, maxRetries: number): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await s3Client.send(command);
      return; // Успешно загружено
    } catch (error) {
      lastError = error as Error;
      logger.warn(`⚠️ Попытка ${attempt}/${maxRetries} неудачна: ${error}`);

      if (attempt < maxRetries) {
        // Экспоненциальная задержка: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Не удалось загрузить файл после ${maxRetries} попыток: ${lastError?.message}`);
}

/**
 * Скачивает файл из Object Storage
 * @param relativePath - Относительный путь к файлу (без uploads/)
 * @returns Buffer с содержимым файла
 */
export async function downloadFileFromCDN(relativePath: string): Promise<Buffer> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";

    // Убираем ведущий слеш если есть
    let key = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

    // Если путь не начинается с uploads/, добавляем его
    if (!key.startsWith("uploads/")) {
      key = `uploads/${key}`;
    }

    logger.info(`⬇️ Скачиваем файл из CDN: ${key}`);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("Файл не найден или пустой");
    }

    // Конвертируем stream в Buffer
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);
    logger.info(`✅ Файл скачан из CDN: ${key}, размер: ${buffer.length} байт`);

    return buffer;
  } catch (error) {
    logger.error("Ошибка скачивания из CDN", toLogError(error), { relativePath });
    throw error;
  }
}

/** Результат streamFileFromCDN: stream и метаданные, при Range — contentRange и isPartialContent */
export type StreamFileFromCDNResult = {
  stream: ReadableStream;
  contentLength: number;
  contentType: string;
  contentRange?: string;
  isPartialContent?: boolean;
};

/**
 * Получает ReadableStream для файла из Object Storage (для streaming).
 * Поддержка Range нужна для мобильных браузеров (iOS/Android), иначе HLS зависает.
 * @param relativePath - Относительный путь к файлу (без uploads/)
 * @param range - Опциональный HTTP Range (например "bytes=0-1048575")
 */
export async function streamFileFromCDN(
  relativePath: string,
  range?: string,
): Promise<StreamFileFromCDNResult> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";

    // Убираем ведущий слеш если есть
    let key = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

    // Если путь не начинается с uploads/, добавляем его
    if (!key.startsWith("uploads/")) {
      key = `uploads/${key}`;
    }

    logger.info(`📡 Стримим файл из CDN: ${key}${range ? ` (Range: ${range})` : ""}`);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ...(range ? { Range: range } : {}),
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("Файл не найден или пустой");
    }

    // Конвертируем Node.js Readable в Web ReadableStream
    const nodeStream = response.Body as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const contentLength = response.ContentLength ?? 0;
    logger.info(`✅ Стрим создан для: ${key}, размер: ${contentLength} байт`);

    const result: StreamFileFromCDNResult = {
      stream: webStream,
      contentLength,
      contentType: response.ContentType || "application/octet-stream",
    };

    if (response.ContentRange) {
      result.contentRange = response.ContentRange;
      result.isPartialContent = true;
    }

    return result;
  } catch (error) {
    logger.error("Ошибка создания стрима из CDN", toLogError(error), { relativePath });
    throw error;
  }
}

/**
 * Нормализует относительный путь к ключу S3 (с префиксом uploads/)
 */
function toS3Key(relativePath: string): string {
  let key = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
  if (!key.startsWith("uploads/")) {
    key = `uploads/${key}`;
  }
  return key;
}

/**
 * Копирует один объект в том же бакете (для миграции путей).
 * @param sourceRelativePath - Относительный путь к источнику (с или без uploads/)
 * @param destRelativePath - Относительный путь к назначению (с или без uploads/)
 */
export async function copyObjectInCDN(
  sourceRelativePath: string,
  destRelativePath: string,
): Promise<void> {
  checkCredentials();

  const bucketName = "gafus-media";
  const sourceKey = toS3Key(sourceRelativePath);
  const destKey = toS3Key(destRelativePath);

  logger.info(`📋 Копируем объект в CDN: ${sourceKey} → ${destKey}`);

  const copySource = encodeURI(`${bucketName}/${sourceKey}`);

  const command = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: copySource,
    Key: destKey,
  });

  await s3Client.send(command);

  logger.info(`✅ Объект скопирован в CDN: ${destKey}`);
}

/**
 * Удаляет файл из CDN
 * @param relativePath - Относительный путь к файлу (без uploads/)
 */
export async function deleteFileFromCDN(relativePath: string): Promise<void> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";

    // Убираем ведущий слеш если есть
    let key = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;

    // Если путь не начинается с uploads/, добавляем его
    if (!key.startsWith("uploads/")) {
      key = `uploads/${key}`;
    }

    logger.info(`🗑️ Удаляем файл из CDN: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await s3Client.send(command);

    logger.info(`✅ Файл удален из CDN: ${key}`);
  } catch (error) {
    logger.error("Ошибка удаления из CDN", toLogError(error), { relativePath });
    throw error;
  }
}

/**
 * Рекурсивно удаляет папку со всеми файлами из Object Storage
 * @param folderPath - Путь к папке (например, trainers/{trainerId}/videocourses/{videoId}/)
 * @returns Количество удалённых файлов
 */
export async function deleteFolderFromCDN(folderPath: string): Promise<number> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";

    // Убираем ведущий слеш если есть
    let prefix = folderPath.startsWith("/") ? folderPath.substring(1) : folderPath;

    // Если путь не начинается с uploads/, добавляем его
    if (!prefix.startsWith("uploads/")) {
      prefix = `uploads/${prefix}`;
    }

    // Убеждаемся, что путь заканчивается на /
    if (!prefix.endsWith("/")) {
      prefix += "/";
    }

    logger.info(`🗑️ Удаляем папку из CDN: ${prefix}`);

    let deletedCount = 0;
    let continuationToken: string | undefined;

    // Получаем список всех файлов в папке (может быть несколько запросов если файлов много)
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Удаляем файлы батчами (максимум 1000 файлов за раз)
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key! })),
            Quiet: false,
          },
        });

        const deleteResponse = await s3Client.send(deleteCommand);

        const deleted = deleteResponse.Deleted?.length || 0;
        deletedCount += deleted;

        logger.info(`🗑️ Удалено ${deleted} файлов из ${prefix}`);

        if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
          logger.warn(
            `⚠️ Ошибки при удалении некоторых файлов: ${JSON.stringify(deleteResponse.Errors)}`,
          );
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    logger.info(`✅ Папка удалена из CDN: ${prefix}, всего удалено ${deletedCount} файлов`);

    return deletedCount;
  } catch (error) {
    logger.error("Ошибка удаления папки из CDN", toLogError(error), { folderPath });
    throw error;
  }
}

/**
 * Загружает Buffer в Object Storage
 * @param buffer - Содержимое файла
 * @param relativePath - Относительный путь для сохранения (без uploads/)
 * @param contentType - MIME тип файла
 * @returns URL загруженного файла
 */
export async function uploadBufferToCDN(
  buffer: Buffer,
  relativePath: string,
  contentType: string = "application/octet-stream",
): Promise<string> {
  checkCredentials(); // P2 Security: Runtime check

  try {
    const bucketName = "gafus-media";

    let key = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
    if (!key.startsWith("uploads/")) {
      key = `uploads/${key}`;
    }

    logger.info(`🔄 Загружаем buffer в CDN: ${key}, размер: ${buffer.length} байт`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      CacheControl: "public, max-age=31536000", // 1 год
    });

    await uploadWithRetry(command, 3);

    logger.info(`✅ Buffer загружен в CDN: ${key}`);

    return `https://storage.yandexcloud.net/gafus-media/${key}`;
  } catch (error) {
    logger.error("Ошибка загрузки buffer в CDN", toLogError(error), { relativePath });
    throw error;
  }
}
