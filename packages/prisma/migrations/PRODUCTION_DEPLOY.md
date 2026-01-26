# Инструкция по применению миграций для продакшена

## Миграции заметок тренера

### Список миграций (в порядке применения)

1. `20260125210000_add_trainer_notes` - Создание базовой таблицы TrainerNote
2. `20260125230000_add_note_title_and_tags` - Добавление title и tags
3. `20260126000000_change_note_to_many_students` - Переход на many-to-many для студентов
4. `20260126010000_add_note_entries` - Создание таблицы TrainerNoteEntry
5. `20260126020000_remove_note_content` - Удаление колонки content
6. `20260126030000_move_visibility_to_entries` - Перенос видимости в записи

## Предварительные проверки

### 1. Резервное копирование
```bash
# Обязательно создайте бэкап перед применением миграций
pg_dump $DATABASE_URL > backup_before_notes_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Проверка расширений PostgreSQL
```sql
-- Убедитесь что расширение uuid-ossp доступно
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3. Проверка текущего состояния
```bash
cd packages/prisma
DATABASE_URL="your_production_db_url" npx prisma migrate status
```

## Применение миграций

### Способ 1: Prisma Migrate Deploy (рекомендуется)
```bash
cd packages/prisma
DATABASE_URL="your_production_db_url" npx prisma migrate deploy
```

### Способ 2: Ручное применение (если нужно)
```bash
# Применить каждую миграцию вручную через psql
psql $DATABASE_URL -f migrations/20260125210000_add_trainer_notes/migration.sql
psql $DATABASE_URL -f migrations/20260125230000_add_note_title_and_tags/migration.sql
psql $DATABASE_URL -f migrations/20260126000000_change_note_to_many_students/migration.sql
psql $DATABASE_URL -f migrations/20260126010000_add_note_entries/migration.sql
psql $DATABASE_URL -f migrations/20260126020000_remove_note_content/migration.sql
psql $DATABASE_URL -f migrations/20260126030000_move_visibility_to_entries/migration.sql
```

## Проверка после применения

### 1. Проверка структуры таблиц
```sql
-- Проверить что таблицы созданы
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('TrainerNote', 'TrainerNoteEntry', 'TrainerNoteStudent');

-- Проверить структуру TrainerNote
\d "TrainerNote"

-- Проверить структуру TrainerNoteEntry
\d "TrainerNoteEntry"

-- Проверить структуру TrainerNoteStudent
\d "TrainerNoteStudent"
```

### 2. Проверка данных
```sql
-- Количество заметок
SELECT COUNT(*) FROM "TrainerNote";

-- Количество записей
SELECT COUNT(*) FROM "TrainerNoteEntry";

-- Количество связей со студентами
SELECT COUNT(*) FROM "TrainerNoteStudent";

-- Проверить что все записи имеют заметки
SELECT COUNT(*) 
FROM "TrainerNoteEntry" e
LEFT JOIN "TrainerNote" n ON e."noteId" = n."id"
WHERE n."id" IS NULL;
-- Должно быть 0

-- Проверить что все связи имеют заметки
SELECT COUNT(*) 
FROM "TrainerNoteStudent" ns
LEFT JOIN "TrainerNote" n ON ns."noteId" = n."id"
WHERE n."id" IS NULL;
-- Должно быть 0
```

### 3. Проверка индексов
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('TrainerNote', 'TrainerNoteEntry', 'TrainerNoteStudent')
ORDER BY tablename, indexname;
```

### 4. Проверка внешних ключей
```sql
SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('TrainerNote', 'TrainerNoteEntry', 'TrainerNoteStudent');
```

## Генерация Prisma Client

После применения миграций обновите Prisma Client:

```bash
cd packages/prisma
npx prisma generate
```

## Тестирование функциональности

После применения миграций протестируйте:

1. ✅ Создание заметки через API тренера
2. ✅ Добавление нескольких записей в заметку
3. ✅ Выбор нескольких студентов для заметки
4. ✅ Установка видимости для отдельных записей
5. ✅ Просмотр заметок учеником в web приложении
6. ✅ Фильтрация заметок по тегам (в панели тренера)
7. ✅ Редактирование и удаление заметок

## Откат (если необходимо)

⚠️ **Внимание**: Откат требует восстановления из бэкапа, так как данные были перенесены между таблицами.

```bash
# Восстановление из бэкапа
psql $DATABASE_URL < backup_before_notes_YYYYMMDD_HHMMSS.sql
```

## Известные особенности

1. **Миграция 20260126010000_add_note_entries**: 
   - Переносит данные из `content` в `TrainerNoteEntry`
   - Колонка `content` остается до следующей миграции

2. **Миграция 20260126000000_change_note_to_many_students**:
   - Создает таблицу `TrainerNoteStudent` для связи многие-ко-многим
   - Переносит существующие связи из колонки `studentId`

3. **Миграция 20260126030000_move_visibility_to_entries**:
   - Использует условную логику для безопасного переноса данных
   - Работает даже если колонка уже была удалена

## Контакты

При возникновении проблем при применении миграций:
1. Проверьте логи миграций
2. Убедитесь что все зависимости выполнены
3. Проверьте что расширения PostgreSQL доступны
4. При необходимости восстановите из бэкапа
