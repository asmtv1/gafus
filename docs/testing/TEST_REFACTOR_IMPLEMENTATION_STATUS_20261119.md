# Реализация плана TEST_REFACTOR_PLAN_20261119 — текущая приёмка

**Исторический промежуточный снимок:** актуальный итог строгого self-review, закрытые проверки и оставшиеся блокеры — [`TEST_SYSTEM_RELEASE_READINESS_HANDOFF_20261119.md`](./TEST_SYSTEM_RELEASE_READINESS_HANDOFF_20261119.md). Ниже сохранён первоначальный контекст, а не текущее состояние всех пунктов.

Исходная точка: локальная ветка на `04052d616fa72f8edd2ad49f496f5c744c710fed`, **с множеством незафиксированных параллельных изменений**. Без пуша и выкладки на прод. Нельзя считать результатом всего рефакторинга выполнение одного пилота.

| Поставка | Состояние | Проверенный результат / незакрытая работа |
| --- | --- | --- |
| 1. Inventory | Partial | 70 workspaces, 57 with test commands, 13 explicit gaps; 1919 workspace test files and 295 out-of-workspace entries in the regenerated snapshot. Full workflow/acceptance mapping remains open |
| 2. План/запуск/отчёт | Пилот работает | `test-system.mjs`, JSON-каталоги, 16+ контрактных тестов. Версия плана, SHA, требуемые случаи, дубликаты, пропуски и коды 0/1/2 |
| 3. Быстрые тесты/покрытие | Пилот работает | Названные проверки training и chat. Реальное покрытие canonical core-client training: 40/95 строк (42,10%), 34/102 ветви (33,33%). Нулевые знаменатели запрещены; глобальное объединение ещё не готово |
| 4. Integration environment | Partial | Isolated PG18 passed five domain suites. Docker Compose PG15+Redis7 functional test passed and cleaned up. Strict `prisma migrate deploy` is BLOCKED by missing `ExamResult` at `20241108120000_exam_result_trainer_review` (P3018); migration compatibility and cancellation still open |
| 5. Unit → web | Не завершено | Unit+PG training подтверждены; browser fresh checkout и повторный вход не выполнены |
| 6. Деньги/приватность/очереди | Частично | PostgreSQL платежи, конкурентные события, возвраты и chat; UI и перезапуск реального Worker/очереди не подтверждены |
| 7. Native/OTA | Не завершено | Серверные проверки OTA прошли; подготовлены Maestro YAML. Нет подписанных QA-сборок/нативных E2E/подтверждения OTA-ревизии |
| 8. Все workspace и матрицы | Не завершено | Все проекты проинвентаризированы; тесты 13 без собственных команд и 33/5/18 матрица требуют маршрутизации |
| 9. CI как release gate | Наблюдение | Reusable/nightly workflow планируют, не заменяют деплой-гейты. Проверка CI на GitHub ещё не запускалась |
| 10. Удаление legacy и сопровождение | Частично | Новый `docs/testing/TESTING.md`; legacy не удалён до подтверждённой эквивалентности |

Измерения — локальный пилот при данной конфигурации. Общий результат полного тестирования и готовность к релизу **не подтверждены**.

## Additional verified cases and outstanding test selection

- `security.authorization.session-unit`: all 4 named auth/session and role-demotion unit checks PASS. `security.authorization.http`: all 4 named Hono router contract checks PASS, with domain mocks (not a real database entitlement check).
- `account.delete.pg`: all 4 named self-deletion row, challenge, rollback, and audit checks PASS on isolated PG18. End-to-end account deletion remains BLOCKED.
- `pnpm test:unit --package`: core-client, course-progress-server, api and mobile PASS. Full `@gafus/web-vite` package run was TERMINATED at the durable runner timeout of 480 seconds; its intermediate passing test lines do not constitute an accepted complete result. Web unit speed/chunking is an open issue.
- The strict Prisma migration history cannot bootstrap a blank PG15 with direct `migrate deploy`: `P3018 / 42P01` at `20241108120000_exam_result_trainer_review`. Functional `with-functional` Compose passed but is never an acceptable migration receipt.
- Complete release profile remains INCOMPLETE by design: blocked web E2E, native Android/iOS builds/Maestro, real OTA revision, Apple sandbox and provider receipts prevent false green. No CI run, production deployment or Git push performed by this implementation.

## Обновление: web-vite шардированная регрессия и Maestro preflight (19.11.2026)

- Старый монолит `@gafus/web-vite test` (прерванный через 480 секунд) **не переписывался**. Профиль `pnpm test:web-vite`/`pnpm test:unit --package @gafus/web-vite` разделяет его на 44 обязательные группы с фиксацией набора файлов: 303 Vitest + 1 файл Node Vite config. Достигнуты `44/44`, **3154 passed**, **6 строго известных gated G05 skipped**, `0 failed` и итоговый `REPORT 0` в `.qa/testing/qa-df588eea-1a5f-4b67-86cd-4ff9360cd281/summary.md`. Самая длинная группа ~62 сек; весь регрессионный набор занимает более восьми минут суммарно без общего принудительного обрыва.
- Maestro: три YAML файла, `ru.gafus.app`, RN testID и OTA runtime успешно проверены статически. Физических Android/iOS проверок нет; `maestro` CLI отсутствует, Java не настроена на обычном PATH (альтернативные JDK доступны), нет подключённых устройств. `pnpm test:e2e:mobile:preflight` выдаёт `incomplete`; полный физический чек-лист в `tests/e2e/mobile/README.md`.
- В CI добавлен **только информационный** `testing-web-vite-advisory` (`continue-on-error`, PR/ручной запуск). Его исполнение на GitHub ещё не подтверждено, обязательные release gates не менялись. Никаких коммитов, пуша, деплоя не выполнялось.


### Native Maestro preflight после устранения локальных блокеров (19.11.2026)

- Установлен `maestro` 2.12.1 в пользовательский `~/.maestro/bin`; исправлен стабильный PATH/JAVA_HOME для JDK 17.0.18 с резервными копиями zsh-файлов. По `maestro test --help` подтверждены флаги, но поддерживаемого device-free dry-run нет.
- Три Maestro flow статически проверены (YAML + точные RN testID + SHA) и записаны в отчёт. `plan/run/report --profile native-preflight`: `INCOMPLETE`, `REPORT 2`, `.qa/testing/qa-0ab652c6-515e-4ea8-b4f9-cd4db9960eb5/summary.md`.
- Остаются физические устройства, изолированные подписанные QA-бинарники, QA-OTA-политика, реальная запущенная ревизия и JUnit. CI — только ручной `testing-native-preflight-advisory`, не release gate, не исполнялся на GitHub. Коммита, пуша и деплоя не было.

### Информационный payment / Worker fault-пилот (19.11.2026)

`pnpm test:faults`: **2/2 checks PASS, 5/5 новых named fault assertions**, 23/23 всех витест кейсов на двух изолированных PostgreSQL 18; `REPORT 0`, `.qa/testing/qa-02a144de-ad44-41e9-91d2-a8c9bc5b52c0/summary.md`. Ненадёжные провайдеры заменены синтетическими локальными заглушками; удаление ресурсов проверено, запрещённый report path отклоняется и стенд очищается. Реальные payment sandbox, Worker process SIGKILL и Redis queue restart остаются неиспытанными. Отдельные новые проверки **не** добавлены в `full`/`ci` и не влияют на release gates. Детали: [`TEST_FAULT_PILOT_20261119.md`](./TEST_FAULT_PILOT_20261119.md).

### Измеряемое source coverage payment + Worker (19.11.2026)

Отдельный advisory `pnpm test:coverage-risk`: два одноразовых PG18 `db push` и 23 реальных Vitest assertions. Baseline для **четырёх** источников — 126/623 строк (20,22%) и 133/654 ветви (20,34%); не покрытие монорепозитория. Source checks требуют V8 Istanbul JSON, LCOV, SHA исходников и Vitest/@vitest/coverage-v8 4.1.0, отклоняют нулевые знаменатели и поддельный 100%. Неизмеренные media SQL repo через dist, провайдеры, HTTP, Redis и другие Worker явно открыты. [`TEST_RISK_COVERAGE_PILOT_20261119.md`](./TEST_RISK_COVERAGE_PILOT_20261119.md). No release gates / push / deploy.

### Targeted payment/transition coverage delta

New isolated SQL assertions: 6 transitions and 9 webhook negative/replay/refund branches; source coverage improved from **126/623 to 155/623 lines** and from **133/654 to 167/654 branches**, with immutable previous baseline and an updated active informational baseline. See [`TEST_RISK_COVERAGE_TARGETED_20261119.md`](./TEST_RISK_COVERAGE_TARGETED_20261119.md). No change to release gates.

### Worker + Redis/BullMQ recovery QA

One new **informational only** plan/run/report profile, `recovery`, starts private Redis AOF + PostgreSQL 18 + explicitly owned BullMQ Worker child processes. Validates Redis reconnect, real owned-child SIGKILL after PG checkpoint, stalled-job reclaim, stale SQL fencing, and 2/2 synthetic exactly-once-after-checkpoint submissions. Three named cases PASS, 44/44 contracts PASS. No release gates, commits, pushes or deployments. Production wiring/Beget calls not exercised. See [`TEST_WORKER_REDIS_RECOVERY_20261119.md`](./TEST_WORKER_REDIS_RECOVERY_20261119.md).

### Authenticated API HTTP+SQL advisory profile

`pnpm test:api-acceptance` on original mounted Hono: 9 named cases/33 HTTP requests/9 real SQL receipts, private PG18+Redis. Verifies login/logout, owner/foreign training-day reads and mutations, USER/TRAINER/ADMIN role boundaries, session revocation; all resources removed. Fail-closed case/source/cleanup evidence; **informational only**, no gate change, no commit/push/deploy. See [`TEST_API_AUTHENTICATED_HTTP_ACCEPTANCE_20261119.md`](./TEST_API_AUTHENTICATED_HTTP_ACCEPTANCE_20261119.md).

### Existing Chrome browser cookie acceptance advisory

Local existing-personal-Chrome McpGo Extension acceptance: 13 named real browser cookie/refresh/logout-all steps, 29 mounted-Hono HTTP responses, 13 real PostgreSQL snapshots, 3 separate `*.localhost` cookie hosts, 2 synthetic users, 2 refresh rotations, other-user isolation and SQL revocation verified. Fail-closed artifacts, 7/7 deliberate tamper rejections, all resources and new tabs cleaned. `pnpm test:browser-cookie` requires MCP-browser coordinator; `ci/full` are unchanged and exclude this profile. See [`TEST_BROWSER_COOKIE_ACCEPTANCE_20261119.md`](./TEST_BROWSER_COOKIE_ACCEPTANCE_20261119.md).
