# 🚀 Автоматическое развертывание через CI/CD

## 🎯 Полностью автоматизированный процесс

Теперь развертывание происходит **автоматически** при push в main ветку!

## 📋 Что нужно сделать один раз:

### 1. Настроить GitHub Secrets

Запустите скрипт для получения значений:
```bash
./ci-cd/scripts/setup-github-secrets-automated.sh
```

### 2. Добавить секреты в GitHub

Перейдите в GitHub: **Settings → Secrets and variables → Actions → New repository secret**

Добавьте эти секреты:

| Название | Описание | Как получить |
|----------|----------|--------------|
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | Секрет NextAuth | `openssl rand -base64 32` |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | @BotFather |
| `VAPID_PUBLIC_KEY` | VAPID публичный ключ | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | VAPID приватный ключ | `npx web-push generate-vapid-keys` |
| `YC_ACCESS_KEY_ID` | Yandex Cloud Access Key | Yandex Cloud Console |
| `YC_SECRET_ACCESS_KEY` | Yandex Cloud Secret Key | Yandex Cloud Console |

### 3. Готово! 

Теперь просто делайте push в main ветку:
```bash
git add .
git commit -m "Deploy to production"
git push origin main
```

## 🔄 Как это работает:

1. **Push в main** → Запускается GitHub Actions
2. **Сборка образов** → Docker images собираются и пушатся в registry
3. **Подключение к серверу** → SSH на production сервер
4. **Создание .env** → Автоматически из GitHub Secrets
5. **Развертывание** → Docker Compose запускает все сервисы
6. **SSL сертификаты** → Автоматическая генерация Let's Encrypt
7. **Миграции БД** → Автоматическое применение Prisma миграций

## ✅ Что происходит автоматически:

- ✅ **Создание .env файла** из GitHub Secrets
- ✅ **Сборка Docker образов** с кэшированием
- ✅ **Загрузка образов** в GitHub Container Registry
- ✅ **Развертывание на сервер** через SSH
- ✅ **Настройка переменных окружения**
- ✅ **Запуск всех сервисов** в правильном порядке
- ✅ **Генерация SSL сертификатов**
- ✅ **Применение миграций БД**
- ✅ **Очистка старых контейнеров**

## 🛡️ Безопасность:

- 🔒 **Секреты в GitHub Secrets** (не в коде)
- 🔒 **Автоматическое создание .env** на сервере
- 🔒 **Безопасные права доступа** (600 для .env)
- 🔒 **Очистка старых контейнеров**
- 🔒 **Изоляция сервисов** (нет открытых портов)

## 📊 Мониторинг:

После развертывания проверьте:
- **GitHub Actions**: https://github.com/asmtv1/gafus/actions
- **Статус сервисов**: `docker-compose ps`
- **Логи**: `docker-compose logs -f`

## 🌐 Доступ к приложениям:

- **Основной сайт**: https://gafus.ru
- **Панель тренера**: https://trainer-panel.gafus.ru
- **Мониторинг ошибок**: https://monitor.gafus.ru
- **Очереди**: https://queues.gafus.ru

## 🔧 Управление:

### Откат к предыдущей версии:
```bash
# На сервере
docker-compose -f ci-cd/docker/docker-compose.prod.yml down
git reset --hard HEAD~1
docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d
```

### Просмотр логов:
```bash
# На сервере
docker-compose -f ci-cd/docker/docker-compose.prod.yml logs -f [service_name]
```

### Перезапуск сервиса:
```bash
# На сервере
docker-compose -f ci-cd/docker/docker-compose.prod.yml restart [service_name]
```

## 🚨 Устранение проблем:

### Если развертывание упало:
1. Проверьте GitHub Actions logs
2. Проверьте, что все секреты добавлены
3. Проверьте SSH доступ к серверу

### Если сервис не запускается:
1. Проверьте логи: `docker-compose logs -f [service]`
2. Проверьте .env файл: `cat ci-cd/docker/.env`
3. Проверьте переменные: `docker-compose config`

## 🎉 Готово!

Теперь у вас **полностью автоматизированное развертывание**! Просто делайте push в main ветку, и все остальное произойдет автоматически.
