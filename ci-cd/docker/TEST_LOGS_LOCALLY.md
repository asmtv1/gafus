# Локальное тестирование Promtail и Loki

## Шаги для тестирования

1. **Запустить Docker Desktop** (если не запущен)

2. **Запустить Loki и Promtail локально:**
```bash
cd ci-cd/docker
docker-compose -f docker-compose.local.yml up -d loki promtail
```

3. **Проверить статус контейнеров:**
```bash
docker ps | grep -E 'loki|promtail'
docker logs gafus-promtail-local --tail 20
docker logs gafus-loki-local --tail 20
```

4. **Собрать и запустить один из контейнеров приложения (например, web):**
```bash
# Собрать образ
cd ../..
pnpm build --filter=web
docker build -f ci-cd/docker/Dockerfile-web-optimized -t gafus-web-local:test .

# Запустить контейнер
docker run -d --name gafus-web-test \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  gafus-web-local:test

# Генерировать логи
for i in {1..20}; do
  docker logs gafus-web-test --tail 1
  sleep 0.5
done
```

5. **Проверить, что логи попадают в Loki:**
```bash
# Подождать 10-15 секунд для обработки
sleep 15

# Запросить логи из Loki
curl -s "http://localhost:3100/loki/api/v1/query_range?query={tag_container_logs=\"true\"}&limit=10&start=$(date -u -v-1M +%s)000" | jq '.data.result | length'

# Или через браузер:
# http://localhost:3100/ready
```

6. **Проверить логи Promtail:**
```bash
docker logs gafus-promtail-local --tail 50 | grep -iE 'pushing|sent|batch|error'
```

7. **Остановить тестовые контейнеры:**
```bash
docker stop gafus-web-test
docker rm gafus-web-test
docker-compose -f docker-compose.local.yml down
```

## Ожидаемый результат

- Promtail должен читать логи из `/var/lib/docker/containers/*/*-json.log`
- Promtail должен отправлять логи в Loki
- Loki должен возвращать логи по запросу `{tag_container_logs="true"}`

## Если логи не попадают в Loki

1. Проверить конфигурацию Promtail:
```bash
docker exec gafus-promtail-local cat /etc/promtail/promtail.yml
```

2. Проверить подключение Promtail к Loki:
```bash
docker exec gafus-promtail-local sh -c 'nc -zv loki 3100'
```

3. Проверить debug логи Promtail:
```bash
docker logs gafus-promtail-local 2>&1 | grep -iE 'error|warn|template|label'
```

