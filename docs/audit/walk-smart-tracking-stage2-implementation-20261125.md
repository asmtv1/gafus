# GAFUS Smart Tracking — второй этап, реализация P0 и подготовка P1
Дата: 25.11.2026. База: HEAD 8204d236d + существующее незакоммиченное дерево первого этапа.
Статус: частичная реализация; fieldAcceptance=not_run; releaseReady=false.
Никаких изменений на проде, коммита, push, нативной сборки или выпуска OTA.

## Реализовано
- Сохранены v1, v2 config 1/2 и исходный golden replay. Отдельный config 3 только для эксперимента: ограниченное время/радиус подтверждения GPS-lock, замена отвергнутого первого кандидата. В мобильном writer config 3 не выбирается.
- Версия синтетического fixture 2: измеренное и полученное время, метрические координаты, шаговые интервалы; сравнение полного reducer. Отчёт scripts/qa/walk-smart-tracking-replay.mjs -> docs/audit/walk-smart-tracking-replay-20261125.json.
- SQLite walk_tracking_pins: атомарный pin mode/config вместе с журналом до запуска GPS. Старый активный журнал без GPS остаётся на v1; сохранённый GPS checkpoint имеет приоритет. Конфликт активных ID не перезаписывает чужую прогулку, завершённая сессия не воскресает. Future codec блокирует запись без перезаписи; остановка отключает запись, канонические точки доступны.
- Для v2 median: gps_tracking_tail хранит один базовый checkpoint и максимум 64 входных fix, только локально. Поздняя пауза в пределах подтверждённого хвоста переигрывает reducer без будущих наблюдений в той же транзакции; завершение/удаление очищает хвост. Если хвост отсутствует или граница старше него, остаётся прежний fallback обрезки, который не гарантирует восстановление медианной вершины. Нужна отдельная проверка SQLite+WAL, энергопотребления и отката.
- Экран создаёт активную прогулку и фиксирует время нажатия до запросов разрешений, сохраняет до запуска датчиков; UI-таймер больше не зависит от первоначального ответа шага/уведомлений. Независимый запуск всех источников при зависшем диалоге, p95 и межruntime гонки команд одного walkId ещё не доказаны.
- Чистый эксперимент stepEvidence: полные непересекающиеся интервалы одного owner/walk/epoch/clock/source, дедупликация по identity, отказ от пропорционального распределения. summarizeDistanceCoverage различает null/0, подтверждённые GPS-метры и оценку только на непокрытом интервале с подтверждением перемещения. Шаги на месте не означают метры. Модуль не включён в mobile writer или DTO.

## Результаты синтетики
| Контроль | Истина, м | v1 | v2 median | Lock candidate |
| --- | ---: | ---: | ---: | ---: |
| Ложный старт | 0 | 60 | 60 | 0 |
| Согласованный дрейф | 0 | 21.6 | 16.8 | 16.8 |
| Короткий разворот | 8.4 | 0 | 0 | 0 |
| Медленная прямая | 180 | 169.2 | 180 | 180 |
| Чередующийся шум стоянки | 0 | 2250 | 0 | 0 |

Последние два проблемных входа остаются P1-задачами. Step evidence вычисляется отдельно, не участвует в motion gate. Ни один синтетический тест не является измерением реальной GPS-точности.

## Проверки реализации
Node 22: core-client walk-tracking 19, mobile walk 118 (SQLite 16), web-vite walks 5, API walks 13, tracking-server walksService 3 — 158/158. Core-client build и mobile typecheck успешны. Первый replay совпал байт в байт; второй replay также воспроизводится; git diff --check успешен.
Команды:
```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
pnpm --filter @gafus/core-client test src/walk-tracking
pnpm --filter @gafus/core-client build
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/mobile exec vitest run src/features/walk
pnpm --filter @gafus/web-vite exec vitest run src/features/walks
pnpm --filter @gafus/api exec vitest run src/routes/v1/walks.test.ts
pnpm --filter @gafus/tracking-server exec vitest run src/walksService.test.ts
node scripts/qa/walk-gps-replay.mjs --require-synthetic | cmp - docs/audit/walk-gps-replay-20261125.json
node scripts/qa/walk-smart-tracking-replay.mjs --require-synthetic | cmp - docs/audit/walk-smart-tracking-replay-20261125.json
```

## Незакрытые условия плана
- P0.1: добровольный защищённый QA-захват, TTL, экспорт и реальный эталон не реализованы; полевых данных нет.
- P0.2: tail вне окна, точная полуоткрытая граница старого codec, полноценная межruntime сериализация pause/resume одного ID, rollback на старом APK/IPA и отдельные разрешения/фон не прошли приёмку.
- P1: синхронные нативные шаговые интервалы, автомат движения, confidence, shadow реального потока, персональная калибровка и новые агрегаты не интегрированы. Нельзя заменять исторические GPS-метры или делать вывод о движении только по положительным шагам.
- P1.3/P2/P3: батарея, геометрический кеш, final display, Back to Start, фильтры, граф и нативная fusion не реализованы. По плану они зависят от проверенного P0/P1 и измерений на Galaxy A53 и физическом iPhone.
- GAFUS OTA: текущие изменения JS/SQLite, но совместимость каждого runtime/fingerprint и подписанный recovery-пакет не проверены. Релиз не подготовлен и не разрешён.
- Рабочее дерево содержит изменения других задач. Их не отменяли; не делать общий коммит без разбора.
