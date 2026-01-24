# @gafus/csrf - Защита от CSRF атак

## 📋 Обзор

Пакет `@gafus/csrf` обеспечивает защиту от Cross-Site Request Forgery (CSRF) атак для всех приложений в экосистеме GAFUS.

## 🎯 Основные функции

- **Генерация CSRF токенов** для защиты форм
- **Валидация токенов** на сервере
- **Middleware** для автоматической защиты
- **React компоненты** для интеграции с формами

## 📦 Использование

### Серверная защита

```typescript
import { csrfMiddleware } from "@gafus/csrf";

export default csrfMiddleware(async function handler(req, res) {
  // API логика защищена от CSRF
});
```

### Клиентская интеграция

```typescript
import { useCsrfToken } from '@gafus/csrf/react';

function MyForm() {
  const csrfToken = useCsrfToken();

  return (
    <form>
      <input type="hidden" name="_csrf" value={csrfToken} />
      {/* остальные поля формы */}
    </form>
  );
}
```

## 🔧 API

- `csrfMiddleware` - Middleware для защиты API
- `generateToken()` - Генерация CSRF токена
- `validateToken()` - Валидация токена
- `useCsrfToken()` - React хук для получения токена
