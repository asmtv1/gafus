# Локальная демонстрация метрики проверенного бэкапа

Этот каталог подключается к **локальному** node-exporter read-only как
`/backup-metrics` и опрашивается локальным Prometheus. **Не помещайте сюда
пароли, дампы БД, имена файлов, ссылки S3 или OAuth-токены.**

`gafus_database_backup_last_success_timestamp_seconds` — только Unix timestamp
последнего _успешно подтверждённого_ удалённого PostgreSQL бэкапа. На чистом
стенде метрика отсутствует: не создавайте фиктивное успешное значение только
ради красивого dashboard.

Разрешённые offline-контракты (не соединяются с реальными БД/Yandex/Cloud):

```sh
node --test ci-cd/scripts/backup-to-yandex.test.mjs \
  ci-cd/scripts/emit-verified-backup-metric.test.mjs \
  ci-cd/docker/prometheus/health-monitoring.contract.test.mjs

docker compose -f ci-cd/docker/docker-compose.local.yml config --quiet
```

Скрипт `ci-cd/scripts/backup-to-yandex.sh` использует
`GAFUS_BACKUP_METRICS_DIR` **только при явном задании**. Он создаёт метрику
посредством атомарного rename только _после_ remote GET с совпавшими `size`
и `type=file`. Ошибка загрузки, квота либо несовпадение размера не должны
продвигать timestamp, а ошибка записи метрики при включённой настройке
не объявляется успехом.

В production эта настройка, Prometheus alerts и textfile collector **не
подключались**; любое реальное включение требует отдельного разрешения,
учёта прав каталога, мониторинга самой доставки и проверенного
production cron. Никакие реальные бэкапы в рамках QA не выполнялись.
