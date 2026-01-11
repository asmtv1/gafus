-- Добавляем поле showInProfile для управления видимостью курса в профиле кинолога

ALTER TABLE "Course"
ADD COLUMN "showInProfile" BOOLEAN NOT NULL DEFAULT true;
