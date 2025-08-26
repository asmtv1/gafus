#!/bin/bash

# Скрипт для копирования базовых изображений при деплое
# Запускается на сервере после git pull

echo "Копирование базовых изображений..."

# Создаем папки если их нет
mkdir -p uploads/{avatars,pets,courses,shared}

# Копируем изображения из public-assets
cp packages/public-assets/public/uploads/avatar.svg uploads/shared/ 2>/dev/null || echo "Файл avatar.svg уже существует"
cp packages/public-assets/public/uploads/avatars/.gitkeep uploads/avatars/ 2>/dev/null || echo "Файл .gitkeep уже существует"
cp packages/public-assets/public/uploads/pets/.gitkeep uploads/pets/ 2>/dev/null || echo "Файл .gitkeep уже существует"
cp packages/public-assets/public/uploads/courses/* uploads/courses/ 2>/dev/null || echo "Файлы курсов уже существуют"

echo "Базовые изображения скопированы в uploads/"
echo "Теперь можно запускать docker-compose"
