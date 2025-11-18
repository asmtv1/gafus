# @gafus/cdn-upload - Загрузка файлов в CDN

## 📋 Обзор

Пакет `@gafus/cdn-upload` предоставляет функциональность для загрузки файлов в CDN (Content Delivery Network) с поддержкой AWS S3.

## 🎯 Основные функции

- **Загрузка файлов** в AWS S3
- **Генерация пресigned URLs** для безопасной загрузки
- **Оптимизация изображений** перед загрузкой
- **Валидация типов файлов** и размеров

## 📂 Структура каталогов CDN

- `uploads/steps/*` — изображения и документы шагов
- `uploads/trainer-videos/*` — личные видео тренеров из панели (`trainerId` внутри пути)
- `uploads/public/*` — общие публичные ассеты

> Для новых видео используйте относительный путь вида `trainer-videos/{trainerId}/{uuid}.mp4`. Пакет автоматически добавит префикс `uploads/`.

## 📦 Использование

### Загрузка файла
```typescript
import { uploadFileToCDN } from "@gafus/cdn-upload";
import { randomUUID } from "crypto";

const relativePath = `trainer-videos/${trainerId}/${randomUUID()}.mp4`;

await uploadFileToCDN(file, relativePath);
```

### Генерация пресigned URL
```typescript
import { generatePresignedUrl } from '@gafus/cdn-upload';

const url = await generatePresignedUrl({
  bucket: 'my-bucket',
  key: 'uploads/image.jpg',
  expiresIn: 3600 // 1 час
});
```

## 🔧 API

- `uploadToCDN(file, options)` - Загрузка файла в CDN
- `generatePresignedUrl(options)` - Генерация пресigned URL
- `validateFile(file, rules)` - Валидация файла
- `optimizeImage(image)` - Оптимизация изображения
