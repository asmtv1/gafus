# @gafus/mailer

Transactional mail package для отправки писем через SMTP.

## Назначение

Пакет инкапсулирует Nodemailer и env parsing для серверных пакетов/воркеров. Текущий transport рассчитан на SMTP/Postfix в Docker или совместимый внешний SMTP.

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

## Команды

```bash
pnpm --filter @gafus/mailer build
pnpm --filter @gafus/mailer test
```

Не логируйте SMTP credentials и содержимое персональных писем.
