# GAFUS — независимая QA-приёмка, 27.11.2026

Статус: промежуточная приёмка, НЕ release approval. Источник требований — исходный архитектурный план, этапы 0–14, реестр legacy и десять критериев. Базовый SHA: bca1be54b9ab6a170faab2c0e6c5b32e3441148c; main для сравнения: afb4fb0b4. Отдельная ветка qa/architecture-acceptance-20261127. Исходное рабочее дерево другого агента не менялось. Тесты выполнялись на локальных disposable БД/синтетических данных; production, push, merge, deploy, публикация OTA исключены.

Логи текущего запуска: /tmp/gafus-archqa-20261127/ (локально на Mac). Прошедшие тесты относятся к конкретным состояниям дерева в ходе QA, а не автоматически ко всем последующим изменениям. Локальные commits исправлений: ad9647fd022ed4093feb4fa382fd4e6fc8b3a566, d0e70b12a018e01a840789284d31b0666739ed6a. Последний SHA ещё не прошёл весь повтор. Итоговый полный повтор пока не подтверждён.

## Матрица этапов

| Этап | Статус | Подтверждение / остаток |
|---|---|---|
| 0. Исходное состояние, baseline | Частично | Проверены SHA, 1035 файлов diff, чистый отдельный worktree, Node20.20.2/pnpm10.12.4, frozen install 51.769 с. Не выполнены пять пар A/B, контроль ресурсов и независимое воспроизведение. |
| 1. Сборка и кэш | Частично | Первый build 49/50 задач, Core regression; исправлено. Второй 66/67, Worker resolver; исправлено. После исправлений build-r4 PASS 67/67, 158.243 с, 0 cache hits. Cold/warm, инвалидирование входов, восстановление dist и сравнение CI ещё не подтверждены. |
| 2. DI и границы | Частично | 0/34 installers, guards 44/44 после переноса restore fixture, Web/Mobile boundary 0 нарушений, Worker Prisma 0. Два API instance, маршруты reminders и независимые HTTP/ACL проверки не исчерпаны. |
| 3. Chat2 | Частично | Source: batch аватаров findMany + dedup и TTL. Real PG 3/3: конкурентный send/idempotency, сообщение/outbox/sequence. A/B SQL, права 1–80 комнат, inbox/DTO, reconnect и loss ACK не приняты полностью. |
| 4. Каталог | Частично | Source: bounded page 60, Accept negotiation Web/Mobile. Real PG cache revision 5/5 (ACL/demotion, конкурентные операции, отсутствующая запись). Гостевой/старый клиент, эквивалентность поиска, полное сравнение SQL и bytes открыты. |
| 5. Прогулки | Частично | Source: set-based upsert/cursor. Local Hono + PG, 400 запросов, concurrency12, warmup80: p50 9.24/p95 13.73/p99 15.63 мс, 1239.73 rps; outage 503/recovery 200, тестовый actor вместо JWT. Не A/B. Инкрементальное wire/ACK, tombstones, физический GPS/фон/SQLite двух устройств ещё не доказаны. |
| 6. Платежи | Частично | Админ ledger/roles/fraud 5/5 real PG после fix shadowed wallet. YooKassa 17/17, Google Play 3/3. Apple первоначально 9 passed/4 failed (void advisory lock), оба вызова исправлены. Затем обнаружено устаревшее ожидание успешного replay отозванного receipt: реальный контракт APPLE_TRANSACTION_REVOKED (caller maps to INACTIVE); real-PG assertion требует отказ и неизменность данных. Повтор: 17/17 YooKassa + 13/13 Apple/transitions, Google Play 3/3. Sandbox внешних провайдеров и полный mixed-version остаются. |
| 7. Worker / очереди | Частично | Prisma boundary 0; Worker build выявил три отсутствующих subpath aliases (4 диагностики TS), добавлены пути деклараций. Redis/Worker recovery PASS: отключение Redis, SIGKILL после SQL checkpoint, stalled reclaim, отказ stale token, duplicate enqueue suppressed, 2 unique submissions/2 completions, cleanup verified. Centrifugo QA исправлен (worktree-relative root, public Node runtime), запуск BLOCKED: Docker Hub Redis pull TLS handshake timeout. Bull Board и полный production-like crash/replay не приняты. |
| 8. Медиа | Частично | Source/contract проверки CDN/native/CI входят в 24/24. Исправлены lint в sharedCdnPurge. Media CDN purge, deletion outbox, pet media outbox, Chat2 media recovery — isolated PG PASS. Account deletion rows и cleanup snapshot — PASS. Реальная CDN/S3 интеграция, ACL/отзыв signed URL, first frame, jobs и end-to-end deletion не приняты. |
| 9. Offline | Частично | Training atomic isolated PG PASS; поправлены lint в journal и tests. Полная персистентность, смена owner, kill/reconnect/ACK и две установки не приняты. |
| 10. Mobile / OTA | Частично | Metro iOS/Android успешно экспортированы с локальной конфигурацией (Hermes 10471631/10579916 bytes). Native/release contracts входят в 24/24. OTA PG сначала 29 pass/1 fail/7 skip: два устаревших ожидания текста ошибки для internal builds уточнены без ослабления gate. Повтор OTA real-PG 30 passed/7 skipped; signed store binaries, native launch, обязательное OTA/recovery на устройствах не подтверждены. |
| 11. UI | Частично | Web/Admin/Trainer строились во втором build, удалены 2 неработающих Trainer synthetic scripts, исправлены lint, Admin сохраняет ошибку после re-read OTA. Реальный браузер BLOCKED: McpGo-Playwright tunnel client unavailable; отдельный Chromium не запускался. Performance и полные mobile сценарии не приняты. |
| 12. Пакеты и exports | Частично | 67 workspace, 0 циклов; guards проверили source exports, Worker subpath aliases исправлены. Built exports первоначально FAIL: @gafus/npd не выпускал index.d.ts; declaration=true, целевая сборка и наличие артефакта PASS. Полный built guard повтор и tree-shaking/runtime compatibility открыты. |
| 13. Домены | Частично | Проверены отдельные Chat2/курсы/прогулки/ledger/платежи/training/OTA, дополнительно auth rows, email account, entitlements (после fix injection), account deletion/snapshot, pet media outbox, media purge/recovery — PASS. Полный функциональный перечень (pets, feed, Q&A, gallery, calls, notifications, AI и остальные сценарии) ещё открыт. |
| 14. SQL/CI/эксплуатация | Частично | PostgreSQL15 fresh: 163 historical + 29 forward = 192, 0 незавершённых/откатанных, repeat deploy NOOP, parity 186 tables/65 checks/12 triggers/9 functions, 2 historical raw indexes сохранены. Изолированный pg_dump/restore PASS: full schema, synthetic outbox snapshot, unique constraint. Старый snapshot upgrade, S3+OTA encrypted restore, real API/Worker flow, RPO/RTO, Uptrace/Prometheus/alert delivery и безопасный rollback не подтверждены. |

## Критические исправления

- Core adminGafus: локальный walletRow больше не перекрывает injected wallet service; транзакционный ID берётся из результата операции. Real PG 5/5.
- Apple subscription state: результат pg_advisory_xact_lock приведён к text, иначе Prisma отклоняет тип void; сохранены namespace, ключ и transaction scope. Два пути (purchase/server-state).
- Restore QA fixture перенесена в Prisma tests, API использует тестовый helper с инъекцией hash; allowlist не изменён.
- Worker CommonJS resolver: три точечных alias на публичные dist declarations. NodeNext probe выявил многочисленные несовместимые extensionless source aliases, поэтому глобальная смена resolver не применена.
- OTA publication: два assertion для internal builds теперь требуют точный отказ App Store readiness. Третий assertion для app-store и kill switch сохранён. Защита production не изменена.
- Real-PG entitlement smoke: передан реальный readPaid port и сохранена проверка срока/владельца/роли/paid badge/private ACL; повтор PASS.
- Web test inventory: обнаружен drift, включены 2 ранее отсутствовавших test files (42 groups/302 files), inventory check PASS.
- Centrifugo QA script: независимость от абсолютного пути исходного рабочего дерева и от старого приватного dev image; syntax check PASS, broker запуск блокируется Docker Hub.
- Admin mobile release panel: ошибка операции сохраняется после обновления mandatory policies.
- GPS QA: константный warning о неудачной записи truncated marker без координат/секретов. Crypto ASCII regex эквивалентна прежней.
- ESLint: исправления severity=error без отключения правил; 25 автоматических правок в выбранных файлах, 3 ручных изменения. 2 мёртвых Trainer scripts удалены (отсутствует конфиг, puppeteer и действующий потребитель).

## Legacy: решение и доказательства для окончательного удаления

Статус сохранённых элементов — НЕ разрешение на удаление. Где активный потребитель не доказан, нужен дополнительный call-site audit, а не догадка.

| Кандидат из плана | Решение / владелец / критерий |
|---|---|
| Composition install/register shims | Guard 0/34; подтверждён нулевой счётчик. API: проверить mounted routes и второй instance, прежде чем закрыть этап. |
| OTA API reexports | API/Mobile OTA: проверить все реальные import consumers, built exports и старый runtime. |
| Core client reexports | Web/Mobile/Core client: guards 0 исключений для boundary; built tree shake и contract test ещё нужны. |
| Next traces | Web/CI: повторный search scripts/CI/deploy, отсутствие потребителей и зелёная сборка. |
| Prisma schema backup/auth emitted | Prisma/Auth: проверить миграционные инструменты и исходники vs emitted; исторические миграции не удалять. |
| Trainer preview / датированные скрипты | Удалены AG4TrainerAvailabilityChromeSynthetic.mjs и AG4TrainerRejectChromeSynthetic.mjs: отсутствующий конфиг и зависимость, ссылки лишь в историческом аудите; остальное требует UI regression. |
| g1/review/OptIn/Legacy имена | Владелец соответствующего домена: переименовывать только после call-site/contract audit, имена в исторических тестах сами по себе не доказывают dead code. |
| v1 каталог / walk snapshot | Старые мобильные клиенты, API/Courses/Walk: сохранять до telemetry zero consumers, периода совместимости и rollback evidence. |
| Offline/PWA | Web/Mobile offline migration/queue: сохранять до восстановления pending операций старых установок и подтверждённой смены owner. |
| Retired Feed photo queues | Feed/Worker: проверить backlog/retry/DLQ; удалять после drain и отсутствия writers/readers. |
| Beget/dual purge | CDN/Worker: legacy media URLs и receipts; удалить только после миграции всех объектов, zero traffic и доказанного purge/rollback. |
| Stream SDK cleanup | Chat/account deletion: подтвердить отсутствие legacy users/rooms и необходимость внешней очистки до удаления. |
| VK historical | Auth: пользовательские исторические записи сохранять; исполняемые маршруты удалять после проверки supported clients и account deletion. |
| Numbered native patches/root Expo/EAS | Mobile/release: сохранять необходимые для старых бинарников и fingerprint; удалять только после reproducible native builds и проверки recovery. |
| Temporary flags / double read | Feature flags/domain owner: подтвердить отсутствие old path traffic, backfill reconciliation и безопасный rollback. |
| Датированные QA reports/прочее | QA/CI: исторические доказательства не стирать; исполняемые скрипты без потребителей удалять после воспроизводимого replacement coverage. |

## Десять критериев

1. Понятность — частично: локализованы дефекты DI и финансов, полный audit всех domains не выполнен.
2. Границы — частично: 44 guards, 0 циклов, 0/34 installers; runtime / built exports повтор не завершён.
3. Цена чтения — открыто: одиночный нагрузочный замер, нет сопоставимых 5 A/B.
4. Согласованная запись — частично: real PG Chat2, wallet, training, payments; полная идемпотентность всех доменов не доказана.
5. Приватность — частично: ACL cache/roles и outage проверены точечно; приватные медиа/удаление/log audit не закрыты.
6. Клиентский UX — частично: Metro export, UI fixes; реальный Chrome и устройства не приняты.
7. Совместимость — открыто: mixed-version + rollback, native store builds и old clients не подтверждены.
8. Эксплуатация — открыто: PG fresh и recovery частично, end-to-end DR/provider alerts не подтверждены.
9. Воспроизводимость — частично: frozen lockfile, exact base, логи; полный повтор, cache recovery, A/B и CI открыты.
10. Завершённость миграций — частично: fresh chain 192/192, legacy retirement только условное, previous snapshot upgrade не доказан.

Итог: 10/10 не присваивается. Отдельные PASS не заменяют критерии выхода. Не использовать данный отчёт как разрешение на merge или production release.

## Текущие машинные результаты

```text
pg-suites-status.txt
chat2-send-isolated-pg 0
walks-load-and-db-recovery-isolated-pg 0
course-cache-revision-isolated-pg 0
payment-archqa-isolated-pg 1
google-play-isolated-pg 0
training-atomic-isolated-pg 0
ota-version-publication-isolated-pg 1
pg-r2-status.txt
payment-archqa-isolated-pg 1
ota-version-publication-isolated-pg 0
database-backup-restore-isolated-pg 0
worker-redis-recovery 0
payment-r3 0
domains-status.txt
auth-rows-isolated-pg 0
media-cdn-purge-isolated-pg 0
media-deletion-outbox-isolated-pg 0
entitlements-isolated-pg 1
pet-media-outbox-isolated-pg 0
email-account-isolated-pg 0
chat2-media-recovery-isolated-pg 0
account-deletion-rows-isolated-pg 0
account-cleanup-snapshot-isolated-pg 0
centrifugo-handshake 1
entitlements-r2 0
final-static-status.txt
build 0
unit 2
```
Коды 0 — exit success, 1/2 — первоначальные ошибки или blocker; повторы обозначены r2/r3. Полный typecheck/lint/unit и повтор guards/exports выполняются, незавершённый запуск не является PASS.

## Изменённые файлы (локальный commit)

```text
M	apps/admin-panel/src/admin-live/MobileReleasesPanel.tsx
M	apps/api/src/a2-observability-private-server.ts
M	apps/mobile/src/features/walk/walkGpsStorage.ts
M	apps/mobile/src/features/walk/walkQaCrypto.ts
M	apps/mobile/src/shared/lib/media/firstFrameObservation.test.ts
M	apps/mobile/src/shared/lib/offline/replayPreventionJournal.test.ts
M	apps/mobile/src/shared/lib/offline/replayProgressJournal.test.ts
M	apps/mobile/src/shared/lib/offline/timerJournalContract.ts
D	apps/trainer-panel/src/trainer-vite/AG4TrainerAvailabilityChromeSynthetic.mjs
D	apps/trainer-panel/src/trainer-vite/AG4TrainerRejectChromeSynthetic.mjs
M	apps/web-vite/src/App.tsx
M	packages/cdn-upload/src/sharedCdnPurge.test.ts
M	packages/cdn-upload/src/sharedCdnPurge.ts
M	packages/core/src/services/adminGafus/index.ts
M	packages/core/src/services/feed/feed.integration.test.ts
M	packages/core/src/services/feed/polls.ts
M	packages/core/src/services/feed/preferences.ts
M	packages/core/src/services/feed/smart-preferences.port.test.ts
M	packages/core/src/services/feed/social.ts
M	packages/core/src/services/offline/g1-off021-journal.firstmethod.realpg.test.ts
M	packages/mobile-ota-server/tests/version-publication.realpg.test.ts
R097	apps/api/src/test/a2-restore-fixture.ts	packages/prisma/tests/a2RestoreFixture.ts
M	packages/subscription-payment-server/src/appleSubscriptionState.realpg.test.ts
M	packages/subscription-payment-server/src/appleSubscriptionState.ts
M	packages/worker/tsconfig.json
M	scripts/qa/chat2-centrifugo-local-handshake.sh
M	scripts/qa/entitlements-real-pg.smoke.ts
M	tests/catalog/web-vite-groups.json
```

## Дополнение к последнему checkpoint

- NPD: включён emit деклараций для заявленного публичного types export; targeted build PASS.
- Admin MobileIntro: восстановлены два недостающих runtime imports, canonical/legacy route normalization. Первоначальный Admin unit 247 pass / 6 fail, из них четыре связаны с missing imports; targeted repeat не завершён. Два других сценария (direct subscription deep link и trainer picker) и admin-rewarded-ads-server unit failure открыты.
- Unit profile после исправления manifest стартовал; полного результата нет. Typecheck, lint, повтор guards и built exports не подтверждены на последнем SHA.
- Исходный план прочитан; отчёты реализации просмотрены по оглавлениям/релевантным разделам, но построчный аудит каждого документа не завершён.
- Пять A/B пар не проведены. Native E2E, Chrome, provider sandbox, external S3/OTA recovery и alert delivery остаются открыты.
- Последний кодовый commit: d0e70b12a018e01a840789284d31b0666739ed6a; файл отчёта коммитится отдельно.

### Дополнительные файлы

- apps/admin-panel/src/admin-live/MobileIntroPanel.tsx
- apps/admin-panel/src/admin-live/mobileIntroNavigation.ts
- packages/npd/tsconfig.json

### Незавершённые локальные операции на момент среза

- static sequence: 8f3405a4185858595ee1699d78216360622995755e70c513
- unit profile: 3dcc20f0096fd3152dd039b094926a6b09b9f3f07e73ac6f
- Admin targeted: d820f143c30a8df9e9ec131b80362b5afa54ff6d56618bf3

Проверять статус по логам и exit code; наличие запущенного job не означает PASS.
