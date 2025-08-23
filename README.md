# 🚀 Gafus - Training Platform

Современная платформа для обучения с поддержкой PWA, push-уведомлений и аналитики.

## 🚀 Быстрый старт

### 1. Настройка GitHub Secrets

Добавьте в GitHub Repository → Settings → Secrets:
- `SERVER_HOST`: 185.239.51.125
- `SERVER_USERNAME`: root  
- `SERVER_PASSWORD`: 3z6Uefq9PR04S2uYKn
- `SERVER_PORT`: 22

### 2. Настройка сервера

```bash
# SSH на сервер
ssh root@185.239.51.125

# Клонирование и настройка
git clone https://github.com/asmtv1/gafus.git /root/gafus
cd /root/gafus
chmod +x scripts/setup-server.sh
./scripts/setup-server.sh
```

### 3. DNS настройка

Настройте DNS записи:
- `gafus.ru` → 185.239.51.125
- `trainer.gafus.ru` → 185.239.51.125  
- `errors.gafus.ru` → 185.239.51.125

### 4. SSL сертификаты

```bash
certbot --nginx \
  -d gafus.ru \
  -d www.gafus.ru \
  -d trainer.gafus.ru \
  -d errors.gafus.ru
```

## 🔄 CI/CD

- **Автоматический деплой** при push в main
- **Умная сборка** - только измененные приложения
- **Ручной деплой** через GitHub Actions

## 📚 Документация

- [Полное руководство по деплою](DEPLOYMENT.md)
- [Настройка GitHub Secrets](scripts/setup-github-secrets.sh)

## 🆘 Поддержка

Для подробной информации см. [DEPLOYMENT.md](DEPLOYMENT.md)
# Trigger new workflow
