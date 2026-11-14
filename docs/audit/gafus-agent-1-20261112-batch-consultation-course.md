# AG1: Course completion + consultation eligibility — проверенный пакет

Дата проверки: 12.11.2026. Ветка `main`, локальный рабочий каталог `gafus-refactor`. Деплой, миграции и любые изменения production НЕ выполнялись. Исходное большое дерево незакоммиченных изменений сохранено. Все операции на Mac выполнялись через McpGo-Terminal1.

## Изменения границ

- `packages/core/src/services/user/userCourseService.ts`: выделен чистый `createUserCourseService(ports)`. Core больше не импортирует `@gafus/course-progress-server/completion`; транзакционные операции и owner/course идентификаторы передаются через порты. Реальная композиция: `apps/api/src/modules/user/composition/course-completion.ts`. Существовавшая политика full-day completion, replay/idempotence и error response сохранена.
- `packages/core/src/services/consultation/bookingEligibility.ts`: выделен `createConsultationBookingEligibilityService(readRestrictions)`. Расчёт активной брони и 168-часового cooldown перенесён в `packages/consultation-shared/src/booking-eligibility.ts`; ошибка `ConsultationBookingRestrictedError` со status 403 сохранена. Owner-scoped чтение находится в `@gafus/consultation-query-server/booking-eligibility`, API связывает их в `apps/api/src/modules/consultations/composition/booking-eligibility.ts`.
- `packages/consultation-write-server/src/service.ts`: бронирование проверяет eligibility в исходной транзакции ПОСЛЕ `lockConsultationClient(tx, clientId)`. Раннее прекращение при конфликте idempotency receipt, атомарный lock слота, письмо/outbox и owner ACL не перенесены на отдельную транзакцию.
- `apps/api/src/modules/consultations/application/list-cynologists.ts`, composition и Hono-маршрут теперь передают только публичный DTO без ORM. Strict `dependency-architecture.test.ts` обновлён на явно разрешённый локальный read port, при этом запрет внешних зависимостей Application не ослаблен.
- Два импорта `Core → server` устранены: **54 → 52**; frozen base 77, resolved 25, new 0. Это не означает окончание плана или разрешение остальных 52 зависимостей.

## Проверенные регрессионные контракты

- На изолированном source snapshot: `pnpm --filter @gafus/core typecheck` PASS, `pnpm --filter @gafus/api typecheck` PASS, `pnpm --filter @gafus/consultation-write-server typecheck` PASS. `pnpm --filter @gafus/core build` PASS.
- `userCourseService.ports.test.ts`: 6 PASS. API course-completion composition: 2 PASS. Consultation booking core service + eligibility: 37 PASS; API consultations route: 12 PASS; owner-bound catalog Hono mounted: 5 PASS; API G11 consultations: 25 PASS; read spans: 2 PASS; strict dependency graph: 83 PASS.
- Snapshot-wide Core: **2076 PASS, 136 SKIPPED, 1 FAIL**. Последний FAIL не относится к переносу: приватный S3 avatar cleanup требует physical nonprod credential gate; source snapshot намеренно исключает `.env` и секреты (`ISOLATED_S3_UNSAFE_ENVIRONMENT`). В ОСНОВНОМ дереве этот тест ранее PASS в общем 33-stage прогоне. Не подменять это на «всё зелёное» в изолированном snapshot.
- Snapshot-wide API до исправления strict wiring: **2701 PASS, 266 SKIPPED, 1 FAIL**. Исправлен локальный import-порт в test wiring и тип DTO; соответствующие 83 strict-tests теперь PASS. Повторный общий API suite требуется на финальном кандидате.
- На основном дереве после переноса: `pnpm check:core-boundaries`: PASS, 52 remaining / 25 resolved / 0 new.
- Проверка одного состояния ДО переноса: `architecture-final-regression.sh a1-arch-final-20261111b` **33/33 PASS**; `architecture-chaos-local.sh a1-arch-chaos-20261111` **5/5 PASS**. Они НЕ доказывают новый кандидат; следующий rerun `a1-arch-final-20261112c` и chaos `a1-arch-chaos-20261112c` запущены отдельно и должны получить `exit_code=0` до обновления ратчета.

## Операционные ограничения

- Не изменять frozen baseline `docs/audit/core-server-facade-baseline.json` до подтверждённой полной регрессии на финальном кандидате.
- Не объявлять сценарии Cloud.ru / Beget ACL / alert delivery успешными без изолированного staging и разрешённых внешних доступов; локальный fake-broker/PG подтверждает только локальные failure paths.
- Не переносить SQL-делегаты ещё остающихся 52 фасадов механической заменой `import` на `export`: порты должны сохранять same-owner ACL, `SELECT FOR UPDATE`, CAS, receipt/outbox и post-commit side effects.
