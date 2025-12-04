-- Скрипт для очистки таблицы ErrorReport перед удалением
-- Все логи теперь в Loki

-- Удаляем все записи из таблицы ErrorReport
DELETE FROM "ErrorReport";

-- Проверяем, что таблица пуста
SELECT COUNT(*) as remaining_count FROM "ErrorReport";
