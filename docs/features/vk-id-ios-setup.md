# VK ID: настройка для iOS

По [официальной документации](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/start-integration/auth-without-sdk/auth-without-sdk-ios).

## Консоль VK ID

В кабинете VK ID создайте приложение с платформой **iOS**:

- **Bundle ID**: `ru.gafus.app` (должен совпадать с приложением)
- Никаких redirect URI добавлять не нужно — для mobile используется схема `vk{client_id}://vk.ru/blank.html`

## Info.plist (уже настроено)

1. **LSApplicationQueriesSchemes** — для работы с приложением VK как провайдером авторизации:
   ```xml
   <key>LSApplicationQueriesSchemes</key>
   <array>
     <string>vkauthorize-silent</string>
   </array>
   ```

2. **CFBundleURLTypes** — схема для OAuth callback:
   ```xml
   <dict>
     <key>CFBundleTypeRole</key>
     <string>Editor</string>
     <key>CFBundleURLName</key>
     <string>VK ID auth callback</string>
     <key>CFBundleURLSchemes</key>
     <array>
       <string>vk54472654</string>
     </array>
   </dict>
   ```
   Где `54472654` — VK_CLIENT_ID_IOS.

## redirect_uri

Формат: `vk{client_id}://vk.ru/blank.html` (тот же, что и для Android).

## Universal Links (опционально)

Если нужна авторизация через приложение VK как провайдера (без открытия браузера), в консоли VK ID укажите Universal Link и добавьте Associated Domains в Xcode. Для WebBrowser (ASWebAuthenticationSession) достаточно custom URL scheme.
