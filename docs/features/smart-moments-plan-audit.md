# Сверка инженерного плана «Умные Моменты» с GAFUS

Основание: исходное исследование «Умная лента» GAFUS: пошаговый план персонализированных «Моментов» (10.10.2026), фактический локальный репозиторий. Состояние отражает **локальный код**, не продакшен. Отметка «в коде» НЕ означает «прошло staging/rollout».

## Обязательное для первого production milestone (P0)

| Требование исходного плана | Состояние | Где / что осталось |
|---|---|---|
| Контракт сортировок, «Для вас» | В коде | `packages/types/src/feed.ts`, Web и Mobile |
| Приватные предпочтения, отключение сигналов, reset | В коде | `smart-preferences.ts`, API; проверить E2E |
| Город: нормализация, backfill, автообновление | В коде; SQL проверен отдельно | Prisma migration + trigger; aliases городов не реализованы |
| Порода: нормализация, алиасы и backfill | **Не готово** | Нужен `breedNormalized`/таксономия |
| Пять источников candidate generation | В коде | `smart-retrieval.ts`; Redis/SQL реальные проверки частично выполнены |
| Контент moderation/hidden/not-interested | В коде | Фильтры на retrieval и hydration |
| Quality-агрегаты (reaction, unique commenter, bookmarks) | В коде; SQL проверен | `smart-aggregation.ts` |
| Materialized author affinity с decay | В коде; **PostgreSQL smoke пройден**, нуждается в production-профилировании | `smart-affinity.ts`; включение отдельным worker-флагом |
| Format affinity | **Не готово (P1 по детальному backlog)** | Различать текст, изображение, видео, карусель |
| Детерминированный score и правила diversity | В коде | `smart-ranking.ts`; онлайн-калибровка не проведена |
| Session cache, cursor, fallback Redis | В коде | Redis-схема; нагрузочная HTTP-проверка ещё нужна |
| Qualified impressions с server-side session validation | В коде | `FeedImpression`, `impressions/batch`; проверка отдельных повторов |
| Server-issued opaque exposure token | **Частично** | Есть Redis session UUID+server validation, но не individual signed/opaque per-card token |
| Active dwell / pause hidden tab / post-open outcomes | **Не готово полностью** | Сейчас регистрируется qualified impression, реальные накопленные dwell и события open не размечены |
| Дедупликация событий + батчинг/retry | Частично | Уникальные eventId и session/post, batch; надежный offline retry/flush на mobile нужен |
| Защита от накрутки | Частично | Hard filters, unique views, self-engagement exclusions; не все user rate limits и anomaly signals |
| A/B sticky user assignment, control/treatment | **В коде, flag OFF** | `smart-experiment.ts`, control использует `new`; проверить real SQL/HTTP/UI |
| A/B user-level report и доверительные интервалы | **В коде; SQL проверен, rollout не проводился** | `smart-experiment-report.ts`; примерный denominator — первый подтверждённый день |
| Shadow / 1% / 5% canary | **Не проведено** | Требуются staging, мониторинг, пользовательский трафик |
| Structured metrics: latency, fallback, diversity, negative | **Частично** | Есть diagnostics/candidateCount; нет всех dashboards/alerts |
| Тесты Web/Mobile E2E | **Частично проверено** | Chrome fixture E2E: offline, reload, hidden tab PASS; mobile adapter network/restart tests PASS; полный login/UI E2E Android/iOS на свежих сборках ещё нужен |
| Интеграция PostgreSQL и Redis | Частично проверено | Изолированные smoke/synthetic tests успешно были; A/B/affinity SQL синтетически проверены на изолированной PostgreSQL; реальных A/B данных нет |
| Реальная production миграция | **Не применялась** | Отдельная историческая проблема migrate deploy на чистой базе |
| Rollback без релиза | В коде | FEED_SMART_ENABLED, FEED_SMART_AB_ENABLED, отдельные ML/source flags |
| Online KPI baseline / sample size / A/B results | **Не готово** | Нужны real-user telemetry и predeclared guardrails |

## P1/P2, требующие данных и отдельного решения о целесообразности

| Пункт | Состояние |
|---|---|
| Logistic ranker, time split, offline quality gate, manual promotion | В коде, **обученной production-модели нет** |
| Форматная привязанность и привязка поста к конкретному питомцу (`FeedPostPet`) | Не готово |
| Постовые темы, форматные признаки, доверие аккаунту, anti-fraud burst / rings | Не готово |
| ANN / Two-Tower learned retrieval, embedding index | П2 — сознательно не внедрён: нет обоснования объёмом корпуса |
| Session/sequence model, adaptive exploration | П2 — не внедрён |
| Full offline NDCG/Recall/novelty, drift, calibration | Не готово |
| Full-feature monitoring, alerting и end-user experiment decision process | Не готово |

## Обязательные проверки перед переключением флагов

1. Добавить реальные post-open и active dwell outcomes, привязанные к server-issued exposure; без этого A/B по ним невозможен.
2. На staging проверить новую миграцию и SQL для experiment report, author affinity; проверить клиентскую сессию при 2+ страницах.
3. Снять baseline для `new`: qualified coverage, engagement, negative, p50/p95 API; определить статистическую мощность на реальном DAU.
4. Провести E2E Web/Mobile, Playwright/эмулятор, кейсы hidden/removed/blocked, отказ Redis и сброс персонализации.
5. Включать последовательно telemetry → shadow → canary → A/B. Модель включать только после накопления зрелого датасета и offline quality gate.

**Нельзя объявлять 100% готовность плана только по unit-тестам.** Точный процент не рассчитывается, пока нет независимой проверки пункта 4 и production acceptance критериев.


## 2026-10-10 additional verified local implementation

- Breed normalization and aliases now exist in schema plus a second additive
  migration; indexed `Pet.breedKey` and trigger are checked in a real SQL smoke.
- Per-card server-issued exposure UUIDs, validated ranking event ingestion,
  deduplication, dwell max, per-user event limiter, and retention are in code.
- Web + Mobile now instrument active dwell and post/profile-open outcomes;
  the full real-device E2E coverage and offline restart durability remain open.
- A new experiment report computes post opens and long dwell from qualified
  exposure outcomes, alongside user-level engagement rates. There are no
  production experiment results, so `eligibleForDecision` remains false.
- `FEED_SMART_SHADOW_ENABLED` now provides sampled asynchronous rule-based
  ranking comparison against current chronological sessions, without
  changing user-visible content; no actual shadow rollout has been conducted.
- `FEED_SMART_MONITOR_ENABLED` provides anonymized aggregate health diagnostics
  and preliminary warnings; dashboard integration and calibrated SLO alerts
  remain open.
- Not yet technically/business-operationally closable without actual user data
  or validated scale: first trained model, online A/B decision, ML embeddings,
  full two-tower ANN retrieval, traffic-calibrated alert thresholds and
  canary/production rollout. Code existence is not production acceptance.
