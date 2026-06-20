# Переход на SMTP.BZ и удаление Postfix

## Summary

Переводим production-почту на SMTP.BZ через существующий `@gafus/mailer`/Nodemailer. Код отправки писем не переписываем: меняем SMTP env в деплойной инфраструктуре, убираем self-hosted Postfix из Docker/CI/CD и обновляем документацию. Раздел SMTP.BZ **«Доступ»** можно не настраивать: если IP не указан, SMTP-доступ разрешен со всех IP; при желании позже можно добавить IP сервера `185.239.51.125` как allowlist.

## Key Changes

- В `ci-cd/docker/docker-compose.prod.yml` удалить сервис `postfix`, volume `postfix_opendkim_keys`, все `depends_on: postfix`, и заменить комментарии на внешний SMTP relay.
- В `.github/workflows/ci-cd.yml`, `.github/workflows/deploy-only.yml`, `.github/workflows/build-single-container.yml`:
  - генерировать `.env` с SMTP.BZ:
    ```sh
    SMTP_HOST=${{ vars.SMTP_HOST || 'connect.smtp.bz' }}
    SMTP_PORT=${{ vars.SMTP_PORT || '2525' }}
    SMTP_SECURE=${{ vars.SMTP_SECURE || 'false' }}
    SMTP_USER=${{ secrets.SMTP_USER }}
    SMTP_PASS=${{ secrets.SMTP_PASS }}
    MAIL_FROM=${{ vars.MAIL_FROM || 'noreply@gafus.ru' }}
    MAIL_FROM_NAME=${{ vars.MAIL_FROM_NAME || 'Гафус' }}
    ```
  - удалить `MAIL_ALLOWED_SENDER_DOMAINS` и `POSTFIX_MYHOSTNAME`;
  - убрать `postfix` из `docker rm -f ...`;
  - заменить `docker-compose ... up -d postgres redis postfix` на `postgres redis`.
- В документации заменить production-описание Postfix/OpenDKIM на SMTP.BZ. `@gafus/mailer` остается основным mailer wrapper.

## Test Plan

- До деплоя:
  - `pnpm --filter @gafus/mailer test`
  - `pnpm --filter @gafus/mailer build`
  - `pnpm --filter @gafus/core typecheck`
  - `docker compose -f ci-cd/docker/docker-compose.prod.yml config`
- После деплоя:
  - убедиться, что `gafus-postfix` больше не существует;
  - проверить env в `web`, `api`, `worker`: `SMTP_HOST=connect.smtp.bz`, `SMTP_PORT=2525`, `SMTP_USER` непустой;
  - отправить тестовые письма через реальные flow: reset password или welcome email;
  - проверить доставку на Gmail, mail.ru, Yandex;
  - проверить SMTP.BZ `Лог` и `Журнал отправки`;
  - проверить `docker ps` на отсутствие `exited/restarting/unhealthy`.

## Rollout

- Не удалять DNS `mail._domainkey` до успешной доставки через SMTP.BZ.
- После успешного деплоя и 24-48 часов нормальной отправки можно удалить старую DNS DKIM-запись `mail._domainkey`.
- Если SMTP.BZ не принимает авторизацию или письма, rollback: вернуть Postfix-сервис и `SMTP_HOST=postfix`, `SMTP_USER/PASS` пустыми.

## Assumptions

- GitHub variables/secrets для SMTP.BZ уже настроены.
- SMTP.BZ домен `gafus.ru` прошел модерацию.
- В SMTP.BZ включены транзакционные письма.
- Используем порт `2525` как основной; если сеть заблокирует его, fallback: `587` с `SMTP_SECURE=false`, затем `465` с `SMTP_SECURE=true`.
- `MAIL_FROM` остается `noreply@gafus.ru`.
