#!/usr/bin/env node

/**
 * Скрипт для загрузки PWA иконок в CDN
 * Используется в CI/CD для автоматической публикации иконок
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

// Конфигурация для Yandex Object Storage
const s3Client = new S3Client({
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  credentials: {
    accessKeyId: process.env.YC_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.YC_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = "gafus-media";
const ICONS_DIR = path.join(__dirname, "../apps/web/public/icons");

async function uploadIconsToCDN() {
  try {
    console.log("🚀 Начинаем загрузку PWA иконок в CDN...");
    
    // Проверяем наличие переменных окружения
    if (!process.env.YC_ACCESS_KEY_ID || !process.env.YC_SECRET_ACCESS_KEY) {
      throw new Error("❌ Отсутствуют переменные окружения YC_ACCESS_KEY_ID или YC_SECRET_ACCESS_KEY");
    }

    // Проверяем наличие папки с иконками
    if (!fs.existsSync(ICONS_DIR)) {
      throw new Error(`❌ Папка с иконками не найдена: ${ICONS_DIR}`);
    }

    const files = fs.readdirSync(ICONS_DIR);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext);
    });

    if (imageFiles.length === 0) {
      throw new Error("❌ В папке с иконками не найдено изображений");
    }

    console.log(`📁 Найдено ${imageFiles.length} файлов для загрузки:`);
    imageFiles.forEach(file => console.log(`  - ${file}`));

    // Загружаем каждый файл
    const uploadPromises = imageFiles.map(async (file) => {
      const filePath = path.join(ICONS_DIR, file);
      const fileContent = fs.readFileSync(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      const key = `uploads/icons/${file}`;

      console.log(`📤 Загружаем ${file}...`);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000", // 1 год
        Metadata: {
          "original-name": file,
          "upload-timestamp": Date.now().toString(),
          "upload-source": "ci-cd-script",
        },
      });

      await s3Client.send(command);
      console.log(`✅ ${file} загружен успешно`);
      
      return {
        file,
        url: `https://gafus-media.storage.yandexcloud.net/uploads/icons/${file}`,
        key
      };
    });

    const results = await Promise.all(uploadPromises);
    
    console.log("\n🎉 Все иконки успешно загружены в CDN!");
    console.log("\n📋 Результаты загрузки:");
    results.forEach(result => {
      console.log(`  ✅ ${result.file} → ${result.url}`);
    });

    console.log(`\n🔗 Все иконки доступны по адресу: https://gafus.ru/icons/`);
    console.log(`📊 Всего загружено: ${results.length} файлов`);

  } catch (error) {
    console.error("❌ Ошибка при загрузке иконок в CDN:", error.message);
    process.exit(1);
  }
}

// Запускаем скрипт
if (require.main === module) {
  uploadIconsToCDN();
}

module.exports = { uploadIconsToCDN };

