# Настройка VK ID для мобильного приложения (iOS и Android)

## Обзор

Мобильное приложение Gafus использует **отдельные приложения VK ID** для iOS и Android. У каждого приложения свой ID, ключи и иконка.

| Платформа | ID приложения | Redirect URI |
|-----------|---------------|--------------|
| Web | 54472652 | `https://gafus.ru/api/auth/callback/vk-id` |
| iOS | 54472654 | `gafus://auth/vk` |
| Android | 54472653 | `gafus://auth/vk` |

## 1. Консоль VK ID (id.vk.com)

### Приложение iOS (54472654)

1. Откройте [id.vk.com](https://id.vk.com) → выберите приложение iOS (ID 54472654).
2. **Подключение авторизации** → **Trusted Redirect URLs** / **Доверенные Redirect URL**:
   - Добавьте `gafus://auth/vk` (если ещё не добавлен).
3. **Universal link** (если используется): `https://gafus.ru/auth/vk`.
4. **Изображение** — загрузите иконку приложения (коричневая кошка с жёлтой книгой). Если иконка белая на устройстве — проверьте формат и размеры в настройках VK.

### Приложение Android (54472653)

1. Выберите приложение Android (ID 54472653).
2. **Подключение авторизации**:
   - **Название пакета приложения:** `ru.gafus.app`
   - **SHA-1 хеш подписи** — добавлен для release/debug.
   - **Trusted Redirect URLs:** добавьте `gafus://auth/vk`.
3. **Изображение** — та же иконка, что и для iOS.

## 2. Переменные окружения

В корневом `.env` (используется web, api, mobile):

```env
# VK ID — Web (NextAuth callback)
VK_CLIENT_ID=54472652

# VK ID — Mobile (отдельные приложения)
VK_CLIENT_ID_IOS=54472654
VK_CLIENT_ID_ANDROID=54472653
VK_MOBILE_REDIRECT_URI=gafus://auth/vk
```

**Важно:** На сервере API должны быть заданы `VK_CLIENT_ID_IOS`, `VK_CLIENT_ID_ANDROID` и `VK_MOBILE_REDIRECT_URI`, иначе обмен кода на токен для mobile будет падать.

## 3. Логика в приложении

- **useVkLogin** и **useVkLink** выбирают `clientId` по `Platform.OS`: iOS → `vkClientIdIos`, Android → `vkClientIdAndroid`.
- API эндпоинты `POST /api/v1/auth/vk` и `POST /api/v1/auth/vk-link` принимают поле `platform: "ios" | "android"` и используют соответствующий `VK_CLIENT_ID_*`.
- Если `platform` не передан — используется `VK_CLIENT_ID` (для совместимости).

## 4. Проверка

1. Соберите приложение: `pnpm -F mobile ios:release` или Android release.
2. Войдите через VK ID на устройстве.
3. При ошибке «redirect_uri is missing or invalid» — проверьте, что `gafus://auth/vk` добавлен в Trusted Redirect URLs нужного приложения (iOS или Android).
4. При ошибке обмена токена — проверьте env на API: `VK_CLIENT_ID_IOS`, `VK_CLIENT_ID_ANDROID`.

## Ссылки

- [vk-auth.md](features/vk-auth.md) — общий обзор VK ID (web + mobile)
- [VK ID документация](https://id.vk.com/about/business/docs/vk-id/overview)
