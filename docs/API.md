# API Документация

## Аутентификация

Все API запросы требуют аутентификации через JWT токен в заголовке `Authorization`:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Пользователи

#### GET /api/users/profile
Получить профиль текущего пользователя

**Ответ:**
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "Имя пользователя",
  "role": "user",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### PUT /api/users/profile
Обновить профиль пользователя

**Тело запроса:**
```json
{
  "name": "Новое имя",
  "email": "new@example.com"
}
```

### Тренировки

#### GET /api/trainings
Получить список тренировок пользователя

**Параметры запроса:**
- `page` (number) - номер страницы
- `limit` (number) - количество на странице
- `status` (string) - статус тренировки

**Ответ:**
```json
{
  "trainings": [
    {
      "id": "training_id",
      "title": "Название тренировки",
      "description": "Описание",
      "duration": 60,
      "status": "completed",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

#### POST /api/trainings
Создать новую тренировку

**Тело запроса:**
```json
{
  "title": "Название тренировки",
  "description": "Описание",
  "duration": 60,
  "exercises": [
    {
      "name": "Упражнение",
      "sets": 3,
      "reps": 10,
      "weight": 50
    }
  ]
}
```

### Достижения

#### GET /api/achievements
Получить достижения пользователя

**Ответ:**
```json
{
  "achievements": [
    {
      "id": "achievement_id",
      "title": "Название достижения",
      "description": "Описание",
      "icon": "icon_url",
      "unlockedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Коды ошибок

- `400` - Неверный запрос
- `401` - Не авторизован
- `403` - Доступ запрещен
- `404` - Не найдено
- `500` - Внутренняя ошибка сервера

## Rate Limiting

API имеет ограничения на количество запросов:
- 100 запросов в минуту для аутентифицированных пользователей
- 20 запросов в минуту для неаутентифицированных пользователей
