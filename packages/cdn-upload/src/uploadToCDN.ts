import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger('cdn-upload');

// Функция для очистки имени файла от недопустимых символов
function sanitizeFileName(fileName: string): string {
  // Убираем недопустимые символы для HTTP заголовков
  // Разрешены только: A-Z, a-z, 0-9, дефис, подчеркивание, точка
  return fileName
    .replace(/[^a-zA-Z0-9\-_.]/g, '_') // Заменяем недопустимые символы на подчеркивание
    .replace(/_{2,}/g, '_') // Убираем множественные подчеркивания
    .substring(0, 100); // Ограничиваем длину
}

// Конфигурация для Yandex Object Storage (S3-совместимый)
const s3Client = new S3Client({
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  credentials: {
    accessKeyId: process.env.YC_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.YC_SECRET_ACCESS_KEY || "",
  },
});

export async function uploadFileToCDN(file: File, relativePath: string): Promise<string> {
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

    return `https://gafus-media.storage.yandexcloud.net/uploads/${relativePath}`;
  } catch (error) {
    logger.error(`❌ Ошибка загрузки в CDN: ${error}`);
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
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Не удалось загрузить файл после ${maxRetries} попыток: ${lastError?.message}`);
}

// Функция для удаления файла из CDN
export async function deleteFileFromCDN(relativePath: string): Promise<void> {
  try {
    const bucketName = "gafus-media";
    
    // Убираем ведущий слеш если есть
    let key = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    
    // Если путь не начинается с uploads/, добавляем его
    if (!key.startsWith('uploads/')) {
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
    logger.error(`❌ Ошибка удаления из CDN: ${error}`);
    throw error;
  }
}
