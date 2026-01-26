# Чеклист миграций для продакшена - Заметки тренера

## Порядок применения миграций

Все миграции должны применяться в строгом порядке:

1. ✅ `20260125210000_add_trainer_notes` - Создание базовой таблицы TrainerNote
2. ✅ `20260125230000_add_note_title_and_tags` - Добавление title и tags
3. ✅ `20260126000000_change_note_to_many_students` - Переход на many-to-many для студентов
4. ✅ `20260126010000_add_note_entries` - Создание таблицы TrainerNoteEntry и перенос данных
5. ✅ `20260126020000_remove_note_content` - Удаление колонки content из TrainerNote
6. ✅ `20260126030000_move_visibility_to_entries` - Перенос isVisibleToStudent в записи

## Проверка перед применением

### 1. Резервное копирование
```bash
# Создать бэкап базы данных перед применением миграций
pg_dump $DATABASE_URL > backup_before_notes_migrations_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Проверка расширений PostgreSQL
Убедитесь, что расширение `uuid-ossp` доступно:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3. Проверка существующих данных
Перед применением миграций проверьте:
- Есть ли существующие записи в таблице TrainerNote
- Корректность данных в колонках studentId и content

## Детали миграций

### 20260125210000_add_trainer_notes
- ✅ Создает таблицу TrainerNote
- ✅ Создает индексы для производительности
- ✅ Добавляет внешние ключи
- ⚠️ **Важно**: Эта миграция создает NOT NULL колонки, убедитесь что данные корректны

### 20260125230000_add_note_title_and_tags
- ✅ Добавляет опциональные поля title и tags
- ✅ Безопасна для применения (использует NULL по умолчанию)

### 20260126000000_change_note_to_many_students
- ✅ Создает таблицу TrainerNoteStudent
- ✅ Переносит существующие данные из studentId
- ✅ Удаляет старую колонку studentId
- ⚠️ **Важно**: Миграция переносит данные, проверьте результат после применения

### 20260126010000_add_note_entries
- ✅ Создает таблицу TrainerNoteEntry
- ✅ Переносит данные из content в новую таблицу
- ✅ Создает индексы
- ⚠️ **Важно**: Колонка content остается в TrainerNote до следующей миграции

### 20260126020000_remove_note_content
- ✅ Удаляет колонку content из TrainerNote
- ✅ Использует IF EXISTS для безопасности
- ⚠️ **Важно**: Убедитесь что все данные перенесены в TrainerNoteEntry

### 20260126030000_move_visibility_to_entries
- ✅ Удаляет updatedAt и isVisibleToStudent из TrainerNote
- ✅ Добавляет isVisibleToStudent в TrainerNoteEntry
- ✅ Переносит значения из старой колонки
- ✅ Использует условную логику для безопасности

## Команды для применения

### Локальная проверка
```bash
cd packages/prisma
npx prisma migrate deploy --preview-feature
```

### Продакшен
```bash
cd packages/prisma
DATABASE_URL="your_production_db_url" npx prisma migrate deploy
```

### Проверка после применения
```sql
-- Проверить структуру таблиц
\d "TrainerNote"
\d "TrainerNoteEntry"
\d "TrainerNoteStudent"

-- Проверить данные
SELECT COUNT(*) FROM "TrainerNote";
SELECT COUNT(*) FROM "TrainerNoteEntry";
SELECT COUNT(*) FROM "TrainerNoteStudent";

-- Проверить индексы
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('TrainerNote', 'TrainerNoteEntry', 'TrainerNoteStudent');
```

## Откат (если необходимо)

⚠️ **Внимание**: Откат миграций требует ручного вмешательства, так как данные были перенесены между таблицами.

Для отката потребуется:
1. Восстановить данные из бэкапа
2. Или вручную откатить изменения в обратном порядке

## Проверка после деплоя

1. ✅ Проверить что все таблицы созданы
2. ✅ Проверить что индексы созданы
3. ✅ Проверить что внешние ключи работают
4. ✅ Проверить что данные корректно перенесены
5. ✅ Протестировать создание/чтение/обновление заметок через API

## Известные проблемы

Нет известных проблем. Все миграции протестированы и готовы к продакшену.
