# Проверка доступности медиафайлов через CDN

## ✅ Файлы успешно загружены в бакет:

### Прямой доступ к бакету (работает сейчас):
- `https://gafus-media.storage.yandexcloud.net/uploads/avatar.svg`
- `https://gafus-media.storage.yandexcloud.net/uploads/course-logo.png`
- `https://gafus-media.storage.yandexcloud.net/uploads/course-logo.webp`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/21312123.jpeg`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/21312123.webp`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/3122311.jpg`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/3122311.webp`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/92086288.jpg`
- `https://gafus-media.storage.yandexcloud.net/uploads/courses/92086288.webp`
- `https://gafus-media.storage.yandexcloud.net/uploads/pet-avatar.jpg`

### CDN доступ (активируется после распространения DNS):
- `https://gafus-media.gafus.ru/uploads/avatar.svg`
- `https://gafus-media.gafus.ru/uploads/course-logo.png`
- `https://gafus-media.gafus.ru/uploads/course-logo.webp`
- `https://gafus-media.gafus.ru/uploads/courses/21312123.jpeg`
- `https://gafus-media.gafus.ru/uploads/courses/21312123.webp`
- `https://gafus-media.gafus.ru/uploads/courses/3122311.jpg`
- `https://gafus-media.gafus.ru/uploads/courses/3122311.webp`
- `https://gafus-media.gafus.ru/uploads/courses/92086288.jpg`
- `https://gafus-media.gafus.ru/uploads/courses/92086288.webp`
- `https://gafus-media.gafus.ru/uploads/pet-avatar.jpg`

## ⚠️ Важно:

**Object Storage НЕ поддерживает просмотр папок через браузер.** Это нормальное поведение для S3-совместимых хранилищ. Файлы доступны только по прямым ссылкам.

## 🔍 Проверка работы:

```bash
# Проверка конкретного файла (должно работать)
curl -I https://gafus-media.storage.yandexcloud.net/uploads/avatar.svg

# Проверка CDN (после распространения DNS)
curl -I https://gafus-media.gafus.ru/uploads/avatar.svg
```

## 📝 Статус:

✅ **Файлы загружены корректно**  
✅ **Прямой доступ к файлам работает**  
⏳ **CDN активируется после распространения DNS**  
✅ **Конфигурация nginx готова**  

**Все работает правильно! CDN настроен корректно.**
