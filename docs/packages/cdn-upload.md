# @gafus/cdn-upload - Загрузка файлов в CDN

## 📋 Обзор

Пакет `@gafus/cdn-upload` предоставляет функциональность для загрузки файлов в CDN (Content Delivery Network) с поддержкой AWS S3.

## 🎯 Основные функции

- **Загрузка файлов** в AWS S3
- **Генерация пресigned URLs** для безопасной загрузки
- **Оптимизация изображений** перед загрузкой
- **Валидация типов файлов** и размеров

## 📂 Структура каталогов CDN

```
uploads/
├── users/
│   └── {userId}/
│       ├── avatar/
│       │   └── {uuid}.{ext}
│       └── pets/
│           └── {petId}/
│               └── {uuid}.{ext}
├── trainers/
│   └── {trainerId}/
│       ├── videocourses/
│       │   └── {videoId}/
│       │       ├── original.{ext}
│       │       └── hls/
│       │           ├── playlist.m3u8
│       │           └── segment-*.ts
│       ├── steps/
│       │   └── {stepId}/
│       │       └── {uuid}.{ext}
│       ├── courses/
│       │   └── {courseId}/
│       │       └── {uuid}.{ext}
│       └── articles/
│           └── {articleId}/
│               └── {uuid}.{ext}
└── exams/
    └── {userStepId}/
        └── {uuid}.{ext}
```

**Описание:**

- `users/{userId}/avatar/` — аватары пользователей
- `users/{userId}/pets/{petId}/` — фото питомцев
- `trainers/{trainerId}/steps/{stepId}/` — изображения шагов
- `trainers/{trainerId}/courses/{courseId}/` — изображения курсов
- `trainers/{trainerId}/articles/{articleId}/` — логотип и изображения статей
- `trainers/{trainerId}/videocourses/{videoId}/` — видео тренеров (HLS)
- `exams/{userStepId}/` — видео экзаменов

> Пакет автоматически добавляет префикс `uploads/` к относительным путям.

## 📦 Использование

### Загрузка файла с использованием helper функций

**Рекомендуется использовать helper функции для генерации путей:**

```typescript
import {
  uploadFileToCDN,
  getUserAvatarPath,
  getPetPhotoPath,
  getStepImagePath,
  getCourseImagePath,
  getExamVideoPath,
} from "@gafus/cdn-upload";
import { randomUUID } from "crypto";

// Аватар пользователя
const avatarPath = getUserAvatarPath(userId, randomUUID(), "jpg");
await uploadFileToCDN(file, avatarPath);

// Фото питомца
const petPhotoPath = getPetPhotoPath(userId, petId, randomUUID(), "jpg");
await uploadFileToCDN(file, petPhotoPath);

// Изображение шага
const stepImagePath = getStepImagePath(trainerId, stepId, randomUUID(), "jpg");
await uploadFileToCDN(file, stepImagePath);

// Изображение курса
const courseImagePath = getCourseImagePath(trainerId, courseId, randomUUID(), "jpg");
await uploadFileToCDN(file, courseImagePath);

// Видео экзамена
const examVideoPath = getExamVideoPath(userStepId, randomUUID(), "webm");
await uploadFileToCDN(file, examVideoPath);
```

### Генерация пресigned URL

```typescript
import { generatePresignedUrl } from "@gafus/cdn-upload";

const url = await generatePresignedUrl({
  bucket: "my-bucket",
  key: "uploads/image.jpg",
  expiresIn: 3600, // 1 час
});
```

## 🔧 API

### Основные функции

- `uploadFileToCDN(file, relativePath)` - Загрузка файла в CDN
- `uploadBufferToCDN(buffer, relativePath, contentType)` - Загрузка Buffer в CDN
- `deleteFileFromCDN(relativePath)` - Удаление файла из CDN
- `deleteFolderFromCDN(folderPath)` - Рекурсивное удаление папки из CDN
- `downloadFileFromCDN(relativePath)` - Скачивание файла из CDN
- `streamFileFromCDN(relativePath)` - Получение ReadableStream из CDN

### Helper функции для генерации путей

- `getUserAvatarPath(userId, uuid, ext)` - Путь для аватара пользователя
- `getPetPhotoPath(userId, petId, uuid, ext)` - Путь для фото питомца
- `getStepImagePath(trainerId, stepId, uuid, ext)` - Путь для изображения шага
- `getCourseImagePath(trainerId, courseId, uuid, ext)` - Путь для изображения курса
- `getExamVideoPath(userStepId, uuid, ext)` - Путь для видео экзамена

### Утилиты

- `getCDNUrl(path)` - Преобразование относительного пути в полный CDN URL
- `getRelativePathFromCDNUrl(cdnUrl)` - Извлечение относительного пути из полного CDN URL
- `isCDNUrl(path)` - Проверка, является ли путь CDN URL
