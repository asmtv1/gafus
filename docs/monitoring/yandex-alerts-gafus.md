# Алерты Yandex Cloud Monitoring (GAFUS)

Метрики для алертов берутся из **нативного** Monitoring (`gafus_*`), их пишет контейнер `yandex-metrics-sync` раз в минуту. Пока синк и Alloy работают, точки есть.

## Push на телефон

В Yandex Cloud для алертов есть метод **Push** (уведомления в [мобильном приложении](https://yandex.cloud/ru/docs/overview/mobile-app/) Yandex Cloud).

1. Установи приложение и войди в тот же аккаунт, что и в консоли.
2. **Monitoring → Каналы уведомлений → Создать канал**  
   ([инструкция](https://yandex.cloud/ru/docs/monitoring/operations/alert/create-channel)).
3. Метод: **Push**, получатели — свой аккаунт.
4. В канале включи отправку при статусах **Alarm** (и при желании **Warning**).
5. Опционально добавь **Telegram** (@ycloud_notify_bot) или **Email** как запасной канал.

Прямого API в `yc` для алертов нет — создание через [консоль](https://console.cloud.yandex.ru/monitoring/alerts).

## Подстановка

Замени `FOLDER_ID` на ID каталога (как в дашборде GENERAL):

`b1g0vbm2pvav4oqc4ds9`

Шаблон метки в запросах:

```text
{folderId="FOLDER_ID", service="custom"}
```

Ниже в примерах уже подставлен продовый `folderId` из репозитория; при другом каталоге замени.

---

## 1. «Контейнер / сервис упал» (доступность)

Со стороны метрик мы видим не Docker напрямую, а **health blackbox** и **PostgreSQL** (`gafus_*_up`, значение `1` — ок, `0` — недоступен).

Создай **отдельный алерт на каждый сервис** (так проще и предсказунее, чем один сложный запрос).

| Название алерта | Запрос (одна строка, режим не text-only) |
|-----------------|------------------------------------------|
| GAFUS: Web недоступен | `"gafus_web_up"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| GAFUS: API недоступен | `"gafus_api_up"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| GAFUS: Worker недоступен | `"gafus_worker_up"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| GAFUS: Bull Board недоступен | `"gafus_bull_board_up"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| GAFUS: PostgreSQL недоступен | `"gafus_postgres_up"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |

**Условие срабатывания (для каждого):**

- Запрос для проверки: тот же (единственный запрос в алерте).
- Агрегация: **Последнее ненулевое значение (last non-NaN)**.
- Окно вычисления: **3m** (или **5m**), чтобы пережить кратковременный провал синка.
- Сравнение с порогом: значение **меньше** порога **Alarm** = `1` (то есть срабатывание при `0` или при отсутствии успеха).  
  Warning можно поставить тоже `1` или не задавать.
- **Alarm:** порог `1`, условие «меньше» (в UI это тип сравнения «меньше» / below — выбери эквивалент для «упал сервис»).

**Отсутствие данных:** для критичных алертов имеет смысл политику «нет точек в окне» выставить в **Alarm** или **No data**, чтобы ловить остановку `yandex-metrics-sync` (иначе алерт может долго оставаться OK).

---

## 2. Диск: свободно &lt; 20%

| Поле | Значение |
|------|----------|
| Название | GAFUS: мало места на диске |
| Запрос | `"gafus_disk_free_percent"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| Агрегация | **Минимум** или **Последнее ненулевое** за окно |
| Окно | **5m** |
| Warning (опционально) | значение **меньше** `25` |
| **Alarm** | значение **меньше** `20` |

---

## 3. RAM «на 100%»

Полные 100% на графике почти не встречаются из‑за округления; разумный критичный порог — **≥ 99%**.

| Поле | Значение |
|------|----------|
| Название | GAFUS: RAM почти заполнена |
| Запрос | `"gafus_ram_percent"{folderId="b1g0vbm2pvav4oqc4ds9", service="custom"}` |
| Агрегация | **Максимум** или **Последнее ненулевое** за окно |
| Окно | **5m** |
| Warning (опционально) | **больше** `90` |
| **Alarm** | **больше** `99` |

При необходимости ужесточи Alarm до `95` или ослабь до `99.5` под свою нагрузку.

---

## Ограничения

- **Nginx, Redis, отдельные контейнеры без blackbox** в `gafus_*` не попадают. Чтобы алертить их, нужны отдельные пробы в Alloy или другие метрики.
- **trainer-panel** и **admin-panel** сейчас не синкаются в `gafus_*`; при необходимости расширь `scripts/sync-metrics-to-yandex-native.py` и добавь алерты по аналогии.

## См. также

- [Создание алерта](https://yandex.cloud/ru/docs/monitoring/operations/alert/create-alert)
- [Канал уведомлений](https://yandex.cloud/ru/docs/monitoring/operations/alert/create-channel)
- [yandex-monitoring.md](./yandex-monitoring.md)
