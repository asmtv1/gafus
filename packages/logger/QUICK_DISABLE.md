# 🔇 Быстрое отключение логов в production

## Самые простые способы:

### 1. **Полное отключение всех логов**
```bash
export DISABLE_LOGGING=true
```
- Только критические ошибки (fatal)
- Никакого консольного вывода
- Никакой отправки в error-dashboard

### 2. **Отключение только консоли (рекомендуется для production)**
```bash
export DISABLE_CONSOLE_LOGGING=true
```
- Логи отправляются в error-dashboard
- Нет консольного вывода
- Сохраняется мониторинг ошибок

### 3. **Отключение только error-dashboard**
```bash
export DISABLE_ERROR_DASHBOARD_LOGGING=true
```
- Логи выводятся в консоль
- Нет отправки в error-dashboard
- Полезно для отладки

## Для Docker:
```dockerfile
ENV DISABLE_CONSOLE_LOGGING=true
```

## Для Kubernetes:
```yaml
env:
- name: DISABLE_CONSOLE_LOGGING
  value: "true"
```

## Для .env файла:
```bash
DISABLE_CONSOLE_LOGGING=true
```

## Проверка:
```bash
# Обычное логирование
node your-app.js

# Отключенные логи
DISABLE_LOGGING=true node your-app.js
```
