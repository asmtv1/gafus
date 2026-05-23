# @gafus/consultation-shared

Общий ESM-пакет для типов и presentation helpers домена консультаций.

## Назначение

Пакет нужен, чтобы web, mobile, panels и core одинаково форматировали консультации без копирования UI-нейтральной логики.

## Экспорты

По `package.json` доступны:

- `@gafus/consultation-shared`
- `@gafus/consultation-shared/types`
- `@gafus/consultation-shared/consultation-msk-format`
- `@gafus/consultation-shared/ru-phone`
- `@gafus/consultation-shared/booking-status-presentation`
- `@gafus/consultation-shared/consultation-catalog-presentation`
- `@gafus/consultation-shared/consultation-intake-display`
- `@gafus/consultation-shared/consultation-slots-presentation`

## Код

- `src/types.ts` - shared типы.
- `src/consultation-msk-format.ts` - форматирование даты/времени в московской зоне.
- `src/ru-phone.ts` - helpers для российских телефонов.
- `src/*presentation.ts` - отображение статусов, каталога, intake и слотов.

## Команды

```bash
pnpm --filter @gafus/consultation-shared build
pnpm --filter @gafus/consultation-shared typecheck
pnpm --filter @gafus/consultation-shared test
```

При изменении форматов консультаций проверьте mobile и web screens, потому что пакет используется как общий контракт отображения.
