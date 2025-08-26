# Настройка Яндекс.Диска для автоматических бэкапов БД

## Шаг 1: Получение токена Яндекс.Диска

1. Перейдите на [Яндекс.Диск API](https://yandex.ru/dev/disk/poligon/)
2. Нажмите "Получить OAuth-токен"
3. Авторизуйтесь в Яндексе
4. Скопируйте полученный токен

**Или используйте готовый токен:** `y0__xDX0eIiGNuWAyC6gsGbFEQE_xcgrWTvvSIoEA5K3fVFfntw`

## Шаг 2: Добавление токена в GitHub Secrets

1. Перейдите в ваш GitHub репозиторий
2. Нажмите Settings → Secrets and variables → Actions
3. Нажмите "New repository secret"
4. Имя: `YANDEX_DISK_TOKEN`
5. Значение: вставьте полученный токен
6. Нажмите "Add secret"

## Шаг 3: Проверка

После добавления токена:
- При каждом деплое будет создаваться бэкап БД
- Бэкап будет автоматически загружаться на Яндекс.Диск в папку `/Gafus/backups/`
- Старые бэкапы (больше 10) будут автоматически удаляться
- Бэкапы сжимаются в `.gz` для экономии места

## Структура бэкапов на диске

Бэкапы сохраняются в папку: [https://disk.yandex.ru/d/5jUK_9xNULmPLg](https://disk.yandex.ru/d/5jUK_9xNULmPLg)

```
/5jUK_9xNULmPLg/backups/
├── gafus_backup_20241201_143022.sql.gz
├── gafus_backup_20241201_150000.sql.gz
├── gafus_backup_20241201_160000.sql.gz
└── ...
```

## Восстановление из бэкапа

```bash
# Скачайте бэкап с Яндекс.Диска
# Распакуйте: gunzip gafus_backup_YYYYMMDD_HHMMSS.sql.gz
# Восстановите: docker exec -i gafus-postgres psql -U gafus -d gafus < gafus_backup_YYYYMMDD_HHMMSS.sql
```

## Безопасность

- Токен хранится в GitHub Secrets (зашифрован)
- Бэкапы загружаются только на ваш Яндекс.Диск
- Временные файлы автоматически удаляются
- Ошибки бэкапа не блокируют деплой
