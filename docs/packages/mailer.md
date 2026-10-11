# @gafus/mailer

Транзакционные письма приложения: Resend HTTPS API или SMTP для локального relay / отката.

## Настройки

```env
MAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
RESEND_FROM=notifications@notify.gafus.ru
MAIL_FROM_NAME=Гафус
MAIL_REPLY_TO=api@gafus.ru
RESEND_WEBHOOK_SECRET=<separate webhook signing secret>
```

Без MAIL_PROVIDER наличие RESEND_API_KEY выбирает Resend, иначе SMTP. Явное MAIL_PROVIDER=resend без ключа завершается ошибкой, без скрытого переключения на SMTP. RESEND_FROM отделён от старого MAIL_FROM, чтобы не отправлять с неподтверждённого адреса Яндекса. Ответы направляются в MAIL_REPLY_TO.

Для SMTP: MAIL_PROVIDER=smtp и SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM. Настройки Телемоста независимы от транспорта почты.

## Журнал

Перед отправкой Resend создаётся TransactionalMailAttempt. ACCEPTED означает приём провайдером, а не доставку. Сохраняются ID провайдера, число получателей, время и код ошибки; содержимое письма и токены сброса пароля не сохраняются. UNKNOWN означает, что сеть оборвалась и результат приёма неизвестен.

Для консультаций deliveryKey равен consultation-<ConsultationEmailLog.id>. Повторы используют тот же Idempotency-Key; уже принятые письма не отправляются заново. При неопределённом результате старше 23 часов требуется ручная сверка, поскольку Resend хранит ключи идемпотентности 24 часа. Остальные вызывающие стороны без deliveryKey создают отдельные попытки для каждого вызова.

POST https://gafus.ru/api/webhooks/resend проверяет подпись Svix по исходному телу, затем сохраняет TransactionalMailEvent. Уникальный ID события защищает от дублей; история сохраняется отдельно от попыток, поэтому порядок прихода событий не затирает информацию. Bounce type/subType сохраняются в errorCode, подробная диагностика доступна в Resend по providerMessageId. Неверная подпись — 400, отсутствие секрета или ошибка БД — 503 для повторной доставки.

## Ввод в эксплуатацию

1. Подтвердить notify.gafus.ru в Resend.
2. Добавить RESEND_API_KEY в корневой локальный .env и GitHub Secrets.
3. Создать webhook с URL https://gafus.ru/api/webhooks/resend; выбрать email.sent, email.delivered, email.delivery_delayed, email.bounced, email.failed, email.complained, email.suppressed. Signing secret сохранить как RESEND_WEBHOOK_SECRET в локальном .env и GitHub Secrets.
4. Применить миграцию 20261011173000_resend_mail_journal до запуска нового приложения. CI/CD передаёт ключи web, API и worker; без миграции отправка завершится ошибкой до обращения к провайдеру.
5. Проверить тестовые отправки на Яндекс/Mail.ru/Gmail, события в журнале и реальный сценарий консультации.
6. Проверять суточный лимит Resend Free (100) отдельно от месячного (3000). Автоматического переноса писем при 429 в этом пакете нет: ошибки передаются вызывающей стороне / очереди.

Локальные команды: pnpm --filter @gafus/mailer build; pnpm --filter @gafus/mailer test.

Вложения: Buffer, строка с encoding, локальный путь; cid сохраняется. Потоки и удалённые пути отклоняются до отправки.
