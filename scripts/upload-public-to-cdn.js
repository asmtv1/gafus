#!/usr/bin/env node

/**
 * Скрипт для загрузки всей статики из /public в CDN
 * Используется для синхронизации локальных файлов с CDN
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
const UPLOADS_DIR = path.join(__dirname, "../apps/web/public/uploads");

// Рекурсивно получаем все файлы из директории
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      // Фильтруем только изображения и SVG
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

async function uploadPublicToCDN() {
  try {
    console.log("🚀 Начинаем загрузку статических файлов в CDN...");
    
    // Проверяем наличие переменных окружения
    if (!process.env.YC_ACCESS_KEY_ID || !process.env.YC_SECRET_ACCESS_KEY) {
      throw new Error("❌ Отсутствуют переменные окружения YC_ACCESS_KEY_ID или YC_SECRET_ACCESS_KEY");
    }

    // Получаем все файлы
    const files = getAllFiles(UPLOADS_DIR);

    if (files.length === 0) {
      throw new Error("❌ Не найдено файлов для загрузки");
    }

    console.log(`📁 Найдено ${files.length} файлов для загрузки\n`);

    // Загружаем каждый файл
    const uploadPromises = files.map(async (filePath) => {
      const fileContent = fs.readFileSync(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      
      // Получаем относительный путь от uploads/
      const relativePath = path.relative(UPLOADS_DIR, filePath);
      // Загружаем в uploads/ с сохранением структуры
      const key = `uploads/${relativePath.replace(/\\/g, '/')}`;

      console.log(`📤 Загружаем uploads/${relativePath}...`);

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          "original-path": relativePath,
          "upload-timestamp": Date.now().toString(),
        },
      });

      await s3Client.send(command);
      console.log(`✅ ${relativePath} → ${key}`);
      
      return {
        file: relativePath,
        url: `https://gafus-media.storage.yandexcloud.net/${key}`,
        key
      };
    });

    const results = await Promise.all(uploadPromises);
    
    console.log("\n🎉 Все файлы успешно загружены в CDN!");
    console.log(`\n📊 Всего загружено: ${results.length} файлов`);
    console.log("\n📋 Примеры URL:");
    results.slice(0, 5).forEach(result => {
      console.log(`  ${result.file} → ${result.url}`);
    });

  } catch (error) {
    console.error("❌ Ошибка при загрузке файлов в CDN:", error.message);
    process.exit(1);
  }
}

// Запускаем скрипт
if (require.main === module) {
  uploadPublicToCDN();
}

module.exports = { uploadPublicToCDN };

