# CI/CD Infrastructure

Эта папка содержит всю инфраструктуру для непрерывной интеграции и развертывания.

## 📁 Структура

```
ci-cd/
├── docker/                    # Docker конфигурации
│   ├── docker-compose.prod.yml    # Продакшен конфигурация
│   ├── docker-compose.smoke.yml   # Тестовая конфигурация
│   └── Dockerfile-*-optimized     # Оптимизированные Dockerfile'ы
├── scripts/                   # CI/CD скрипты
│   ├── backup-to-yandex.sh       # Бэкап на Яндекс.Диск
│   ├── setup-github-secrets.sh   # Настройка GitHub секретов
│   ├── setup-server.sh           # Настройка сервера
│   ├── test-docker-build.sh      # Тест сборки Docker образов
│   └── test-web-docker.sh        # Быстрый тест web приложения
├── configs/                   # Конфигурационные файлы
│   └── environment.yml            # Переменные окружения
└── README.md                  # Этот файл
```

## 🚀 Использование

### Локальное тестирование
```bash
# Тест всех Docker образов
./ci-cd/scripts/test-docker-build.sh

# Быстрый тест web приложения
./ci-cd/scripts/test-web-docker.sh
```

### Развертывание
```bash
# Продакшен
docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d

# Тестовая среда
docker-compose -f ci-cd/docker/docker-compose.smoke.yml up -d
```

## 🔧 GitHub Actions

Workflow файлы находятся в `.github/workflows/` и автоматически используют файлы из этой папки:

- `ci-cd.yml` - Основной CI/CD pipeline
- `deploy-only.yml` - Только развертывание
- `dependency-check.yml` - Проверка зависимостей

## 📦 Docker образы

Все оптимизированные Dockerfile'ы находятся в `ci-cd/docker/`:

- `Dockerfile-web-optimized` - Web приложение
- `Dockerfile-trainer-panel-optimized` - Панель тренера
- `Dockerfile-error-dashboard-optimized` - Дашборд ошибок
- `Dockerfile-worker-optimized` - Worker для очередей
- `Dockerfile-bull-board-optimized` - Bull Board
- `Dockerfile-telegram-bot-optimized` - Telegram бот
- `Dockerfile-prisma-optimized` - Prisma клиент

## 🎯 Преимущества новой структуры

✅ **Централизация** - все CI/CD файлы в одном месте
✅ **Организация** - четкое разделение по типам файлов
✅ **Поддержка** - легко найти и изменить нужный файл
✅ **Документация** - понятная структура с описанием
