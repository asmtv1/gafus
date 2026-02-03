# Оплаченный курс не открывается на проде

## Что проверяет код

- Доступ к платному курсу: наличие записи в **CourseAccess** для пары `(courseId, userId)`.
- Запись создаётся в webhook ЮKassa при `payment.succeeded` (`confirmPaymentFromWebhook` в `gafus-web`).
- Страница курса: `getCurrentUserId()` → при отсутствии редирект; `checkCourseAccessById(courseId, userId)` → при `hasAccess: false` показывается блок «нет доступа» / оплата.

## Команды на сервере (после SSH)

Подключение: `ssh -i ~/.ssh/gafus_server_key root@185.239.51.125`. Далее из каталога с `docker-compose` (например `ci-cd/docker` или где развёрнут прод).

### 1. Логи web-контейнера (страница курса и webhook)

```bash
# Последние 500 строк
docker logs gafus-web --tail 500 2>&1

# Только платежи, webhook и доступ к курсу
docker logs gafus-web --tail 2000 2>&1 | grep -iE "payment|webhook|Платёж|CourseAccess|Ошибка транзакции|Invalid signature|IP not in whitelist|course-service"
```

### 2. В реальном времени

Открыть оплаченный курс в браузере и в другом терминале:

```bash
docker logs gafus-web -f --tail 100 2>&1
```

### 3. Проверка в БД (есть ли доступ у пользователя)

Подставить реальные `COURSE_ID` и `USER_ID` (из логов или из админки):

```bash
docker exec gafus-postgres psql -U gafus -d gafus -c \
  "SELECT id, \"courseId\", \"userId\" FROM \"CourseAccess\" WHERE \"courseId\" = 'COURSE_ID' AND \"userId\" = 'USER_ID';"
```

Проверка платежей по курсу:

```bash
docker exec gafus-postgres psql -U gafus -d gafus -c \
  "SELECT id, \"userId\", \"courseId\", status, \"yookassaPaymentId\", \"createdAt\" FROM \"Payment\" WHERE \"courseId\" = 'COURSE_ID' ORDER BY \"createdAt\" DESC LIMIT 10;"
```

## На что смотреть в логах

| Ситуация | Что искать |
|----------|------------|
| Webhook не доходит или отклоняется | `[payments/webhook] IP not in whitelist`, `Invalid signature`, 403 в логах nginx/доступа |
| Ошибка при выдаче доступа | `Ошибка транзакции` в логах gafus-web (paymentService) |
| Успешная выдача доступа | `Платёж подтверждён, доступ выдан` с paymentId, userId, courseId |
| Пользователь не авторизован на проде | В логах при открытии страницы курса — отсутствие ожидаемых запросов с userId; проверить NEXTAUTH_URL, AUTH_COOKIE_DOMAIN, куки |

## Частые причины

1. **Webhook 403 + «Invalid signature»** — не совпадает `YOOKASSA_SECRET_KEY` с ключом магазина в ЮKassa, которым подписываются уведомления. На проде должен быть **секретный ключ того же магазина** (Интеграция → HTTP-уведомления → тот же магазин, что и ключи API). Проверить: в личном кабинете ЮKassa скопировать секретный ключ заново, вставить в переменную окружения на сервере **без пробелов и переносов в конце**. После правок перезапустить контейнер `gafus-web`.
2. **Webhook 403 по IP** — в логах будет `IP not in whitelist`; за nginx приходит другой X-Forwarded-For (редко).
3. **В БД нет записи в CourseAccess** — webhook не вызывался, вернул 403, или упал с ошибкой до/во время транзакции (смотреть логи web).
4. **На проде пользователь «не залогинен»** — домен куки (AUTH_COOKIE_DOMAIN), NEXTAUTH_URL не совпадает с доменом сайта, из-за чего getCurrentUserId() возвращает null и страница ведёт себя как для гостя (редирект или «нет доступа»).

## Seq (если настроен)

На проде логи из контейнеров могут уходить в Seq. В Seq фильтровать по контейнеру `gafus-web` и по сообщениям: `Платёж подтверждён`, `Ошибка транзакции`, `payments/webhook`, `course-service`.
