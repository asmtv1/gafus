# Корневые сертификаты Apple PKI

Файлы `.cer` в DER — **публичные** корневые сертификаты Apple (не секреты), нужны для `SignedDataVerifier` из `@apple/app-store-server-library`.

Источник: [Apple PKI](https://www.apple.com/certificateauthority/).

- `AppleRootCA-G3.cer`, `AppleRootCA-G2.cer` — актуальные корни.
- `AppleIncRootCertificate.cer` — корень «Apple Inc. Root» (legacy-цепочки; `AppleComputerRootCertificate.cer` с apple.com недоступен).

При ротации корней Apple обновите файлы с официальной страницы.
