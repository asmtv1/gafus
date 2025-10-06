# @gafus/cdn-upload - Загрузка файлов в CDN

## 📋 Обзор

Пакет `@gafus/cdn-upload` предоставляет функциональность для загрузки файлов в CDN (Content Delivery Network) с поддержкой AWS S3.

## 🎯 Основные функции

- **Загрузка файлов** в AWS S3
- **Генерация пресigned URLs** для безопасной загрузки
- **Оптимизация изображений** перед загрузкой
- **Валидация типов файлов** и размеров

## 📦 Использование

### Загрузка файла
```typescript
import { uploadToCDN } from '@gafus/cdn-upload';

const result = await uploadToCDN(file, {
  bucket: 'my-bucket',
  key: 'uploads/image.jpg',
  contentType: 'image/jpeg'
});
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
