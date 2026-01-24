# Проверка Seq на сервере

## Подключение к серверу

```bash
ssh -i ~/.ssh/gafus_server_key root@185.239.51.125
```

## Проверка статуса Seq контейнера

После подключения выполните:

```bash
# Проверка, запущен ли контейнер Seq
docker ps | grep seq

# Или более детальная проверка
docker ps -a --filter "name=gafus-seq"

# Проверка статуса через docker-compose (если находитесь в директории с docker-compose файлом)
cd /path/to/docker-compose
docker compose ps seq
```

## Проверка логов Seq

```bash
# Последние логи контейнера
docker logs gafus-seq --tail 100

# Логи с отслеживанием в реальном времени
docker logs gafus-seq -f

# Логи за последние 5 минут
docker logs gafus-seq --since 5m
```

## Доступ к веб-интерфейсу Seq

Seq не имеет проброшенного порта наружу (доступ только внутри Docker сети). Для доступа:

### Вариант 1: Пробросить порт временно

```bash
# Остановить текущий контейнер
docker stop gafus-seq

# Запустить с проброшенным портом (временно)
docker run -d \
  --name gafus-seq-temp \
  -p 8080:80 \
  -v seq_data:/data \
  -e ACCEPT_EULA=Y \
  -e SEQ_FIRSTRUN_NOAUTHENTICATION=true \
  datalust/seq:latest
```

После этого Seq будет доступен по адресу: `http://185.239.51.125:8080`

### Вариант 2: Использовать SSH туннель (рекомендуется)

На локальной машине:

```bash
ssh -i ~/.ssh/gafus_server_key -L 8080:localhost:80 root@185.239.51.125
```

Затем откройте в браузере: `http://localhost:8080`

**Важно:** Для туннеля нужно знать внутренний порт Seq. Проверьте:

```bash
# Внутри контейнера Seq обычно использует порт 80 или 5341
docker exec gafus-seq netstat -tlnp | grep LISTEN
```

### Вариант 3: Подключиться через другой контейнер в той же сети

```bash
# Войти в контейнер web или другого сервиса
docker exec -it gafus-web sh

# Изнутри контейнера доступен seq:80 или seq:5341
wget -O- http://seq:80/api/events/raw
```

## Проверка работы Vector (сбор логов в Seq)

```bash
# Проверка статуса Vector
docker ps | grep vector

# Логи Vector (покажет, отправляет ли он логи в Seq)
docker logs gafus-vector --tail 100

# Проверка конфигурации Vector
docker exec gafus-vector cat /etc/vector/vector.toml
```

## Проверка данных в Seq через API

```bash
# Получить список событий через API (из контейнера web или через exec)
docker exec gafus-web wget -qO- http://seq:80/api/events?count=10

# Или если Seq на порту 5341
docker exec gafus-web wget -qO- http://seq:5341/api/events?count=10
```

## Диагностика проблем

### Seq не запускается

```bash
# Проверка логов запуска
docker logs gafus-seq

# Проверка дискового пространства
df -h

# Проверка доступности тома
docker volume inspect seq_data
```

### Vector не отправляет логи в Seq

```bash
# Проверка логи Vector
docker logs gafus-vector -f

# Проверка доступности Seq из Vector
docker exec gafus-vector wget -O- http://seq:80/health || docker exec gafus-vector wget -O- http://seq:5341/api
```

### Перезапуск Seq

```bash
# Перезапуск контейнера
docker restart gafus-seq

# Или через docker-compose
cd /path/to/docker-compose
docker compose restart seq
```

## Полезные команды

```bash
# Использование ресурсов Seq
docker stats gafus-seq

# Проверка размера данных Seq
docker exec gafus-seq du -sh /data

# Проверка сетевой связности
docker network inspect <network_name> | grep -A 10 seq
```
