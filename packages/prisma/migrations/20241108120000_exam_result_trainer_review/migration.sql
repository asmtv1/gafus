-- Индекс для быстрого поиска экзаменов по дате проверки тренером
CREATE INDEX IF NOT EXISTS "ExamResult_reviewedAt_idx" ON "ExamResult" ("reviewedAt");
