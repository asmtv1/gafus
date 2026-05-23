# @gafus/video-access

Пакет для подписанных токенов доступа к защищённому видео.

## Назначение

`@gafus/video-access` используется там, где нужно выдавать временный доступ к видео/HLS без раскрытия постоянного storage URL.

## Код

- `src/index.ts` - генерация и проверка JWT-токенов доступа.
- `src/index.test.ts` - unit-тесты контракта.

## Env

- `VIDEO_ACCESS_SECRET` - секрет подписи. Должен быть задан в окружениях, где включена защита видео.
- `NEXT_PUBLIC_ENABLE_HLS_PROTECTION` - feature flag на web-side для HLS protection scenarios.

## Использование

API/training video endpoints и web/trainer video flows должны обращаться к этому пакету вместо ручной подписи URL.

## Команды

```bash
pnpm --filter @gafus/video-access build
pnpm --filter @gafus/video-access test
pnpm --filter @gafus/video-access test:coverage
```
