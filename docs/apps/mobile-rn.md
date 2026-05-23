# Mobile App (@gafus/mobile)

`apps/mobile` - текущее мобильное приложение GAFUS для iOS и Android на Expo Router.

## Стек

- Expo `54.0.34`
- Expo Router `~6.0.21`
- React `19.1.0`
- React Native `0.81.5`
- TypeScript `~5.9.3`
- React Native Paper
- FlashList
- TanStack Query
- Zustand
- Expo Notifications, IAP, Updates, Secure Store, File System, Image Picker, Camera, Video
- `@gafus/analytics/mobile` + AppMetrica
- RuStore Push через `react-native-rustore-push`

## Структура

```text
apps/mobile/
├── app/                  # Expo Router routes
│   ├── (auth)/           # welcome/login/register/reset/vk flows
│   ├── (main)/           # authenticated area
│   └── _layout.tsx
├── src/
│   ├── features/         # app feature modules
│   ├── shared/           # providers, hooks, stores, utils
│   ├── components/
│   └── types/
├── app.json
├── app.config.js         # env -> expo extra, VK schemes
└── eas.json
```

## Основные routes

Auth:

- `(auth)/welcome`
- `(auth)/login`
- `(auth)/register`
- `(auth)/reset-password`
- `(auth)/vk-consent`
- `(auth)/vk-set-phone`

Main tabs:

- courses
- articles
- pets
- achievements
- consultations
- profile

Main nested routes:

- `daily-course/[scheduleId]`
- `articles/[slug]`
- `pets/add`
- `profile/edit`
- `profile/change-password`
- `profile/set-password`
- `profile/change-username`
- `profile/change-email`
- `profile/delete-account`
- `profile/[username]`
- `reminders`
- `consultations/index`
- `consultations/mine`
- `consultations/[userId]`
- `consultations/booking-confirm`

## API contract

Mobile ходит в standalone Hono API `apps/api` (`/api/v1`). Не используйте Next.js Server Actions в mobile.

Основные группы API:

- auth/VK/JWT
- user/profile/account deletion
- courses/favorites/reviews
- daily-course/training/offline
- pets/documents/prevention
- articles
- achievements
- push subscriptions
- reminders
- payments/app subscription
- consultations

Актуальный список endpoints: [API v1](../api/v1-routes.md).

## Конфигурация

`app.config.js` загружает env из `apps/mobile/.env` и корневого `.env`, затем прокидывает значения в `expo.extra`.

Важные env:

- `EXPO_PUBLIC_APP_VERSION`
- `EXPO_PUBLIC_ENABLE_TRACER`
- `EXPO_PUBLIC_TRACER_APP_TOKEN`
- `EXPO_PUBLIC_TRACER_APP_TOKEN_IOS`
- `EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID`
- `VK_CLIENT_ID`
- `VK_CLIENT_ID_IOS`
- `VK_CLIENT_ID_ANDROID`
- `VK_MOBILE_REDIRECT_URI`
- `EXPO_PUBLIC_YM_MOBILE_API_KEY`
- `EXPO_PUBLIC_YM_MOBILE_ENABLED`
- `EXPO_PUBLIC_GAFUS_ANALYTICS_DEBUG`
- `NEXT_PUBLIC_API_URL` или runtime API URL, если используется в client config

`app.json` задаёт:

- `scheme: "gafus"`
- iOS bundle id `ru.gafus.app`
- Android package `ru.gafus.app`
- associated domain `applinks:gafus.ru`
- Android App Link для `/training`
- EAS project id
- Expo Updates URL
- camera/microphone/gallery permissions

## VK ID

`app.config.js` добавляет схемы `vk<clientId>` для iOS/Android и Android intent filters для VK redirect. Mobile VK auth использует PKCE и endpoint `POST /api/v1/auth/vk`.

## Push

Push-слой разделён:

- mobile получает device/token через Expo/RuStore/native APIs;
- сохраняет состояние через `/api/v1/subscriptions/push` и `/api/v1/subscriptions/push/device-status`;
- серверная отправка живёт в `@gafus/webpush` и `@gafus/worker`.

## Платежи и подписка

- Course purchases: `/api/v1/payments/*`.
- App subscription: `/api/v1/app-subscription/*`.
- Apple IAP: `expo-iap`, серверная проверка в API/core.
- Документация: [Apple IAP](../payments/apple-iap.md).

## Команды

```bash
pnpm --filter @gafus/mobile start
pnpm --filter @gafus/mobile android
pnpm --filter @gafus/mobile ios
pnpm --filter @gafus/mobile web
pnpm --filter @gafus/mobile lint
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile test
pnpm --filter @gafus/mobile update:ota:preview
pnpm --filter @gafus/mobile update:ota:production
```

## Правила для изменений

- Общие типы берите из `@gafus/types`.
- Бизнес-правила не дублируйте в mobile: добавляйте их в `@gafus/core`/API и возвращайте готовый контракт.
- Для network/data fetching сверяйтесь с `src/shared` и существующими feature hooks.
- Для новых экранов используйте Expo Router conventions в `app/`.
- Для native permissions обновляйте `app.json`/config plugins и проверяйте iOS/Android тексты разрешений.
