# @gafus/mailer

Transactional mail package для отправки писем через SMTP.

## Назначение

Пакет инкапсулирует Nodemailer и env parsing для серверных пакетов/воркеров. В production используется Яндекс 360 SMTP (`smtp.yandex.ru:465`, secure TLS) через общий SMTP-wrapper; локально можно использовать любой совместимый SMTP.

## Код

- `src/env.ts` - чтение и валидация SMTP/env-настроек.
- `src/send-transactional-mail.ts` - отправка транзакционных писем.
- `src/index.ts` - публичный экспорт.

## Env

Используются переменные:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `MAIL_FROM_NAME`
- `TRANSACTIONAL_EMAIL_LOGO_PATH`
- `WELCOME_EMAIL_IOS_APP_URL`

Production defaults:

```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=api@gafus.ru
SMTP_PASS=<пароль приложения Яндекс 360>
MAIL_FROM=api@gafus.ru
MAIL_FROM_NAME=Гафус
```

Postfix/OpenDKIM и SMTP.BZ не используются в production path. DKIM/SPF настраиваются в DNS Яндекс 360 для домена `gafus.ru`.

## Команды

```bash
pnpm --filter @gafus/mailer build
pnpm --filter @gafus/mailer test
```

Не логируйте SMTP credentials и содержимое персональных писем.
