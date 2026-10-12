#!/usr/bin/env bash
# Coordinated production schema cutover. Run only from the release workflow.
# Old application writers are stopped BEFORE destructive Prisma migrations.
set -euo pipefail
mode="${1:-}"
root="${DEPLOY_ROOT:-/root/gafus}"
compose="${COMPOSE_PROD:-$root/ci-cd/docker/docker-compose.prod.yml}"
release_dir="${RELEASE_BACKUP_DIR:?RELEASE_BACKUP_DIR is required}"
gate="$root/ci-cd/nginx/conf.d/.release-maintenance"
migration_marker="$release_dir/migration-started"
migration_done="$release_dir/migration-complete"
app_services=(web trainer-panel admin-panel api worker bull-board)
cd "$root"

compose_call() { docker-compose -f "$compose" "$@"; }
container_state() {
  docker inspect --format '{{.State.Running}}' "gafus-$1" 2>/dev/null || printf 'absent'
}
check_gate() {
  local status
  for attempt in $(seq 1 12); do
    status="$(curl -k --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 5 \
      --resolve gafus.ru:443:127.0.0.1 https://gafus.ru/api/ping 2>/dev/null || true)"
    if [[ "$status" == 503 ]]; then return 0; fi
    sleep 1
  done
  echo "ERROR: maintenance gate must serve 503; observed ${status:-none}" >&2
  return 1
}
require_gate() {
  [[ -f "$gate" ]] || { echo "ERROR: maintenance gate is not enabled" >&2; return 1; }
  check_gate
}
require_stopped_apps() {
  for app in "${app_services[@]}"; do
    if [[ "$(container_state "$app")" == true ]]; then
      echo "ERROR: old $app still running; refusing destructive Prisma migration" >&2
      return 1
    fi
  done
}
check_health() {
  local app="$1" state
  for attempt in $(seq 1 50); do
    state="$(docker inspect --format \
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{if .State.Running}}running{{else}}stopped{{end}}{{end}}' \
      "gafus-$app" 2>/dev/null || true)"
    [[ "$state" == healthy || "$state" == running ]] && return 0
    [[ "$state" == unhealthy || "$state" == stopped ]] && {
      echo "ERROR: $app is $state" >&2
      return 1
    }
    sleep 3
  done
  echo "ERROR: $app did not become healthy" >&2
  return 1
}
case "$mode" in
  prepare)
    [[ ! -e "$migration_marker" ]] || { echo 'Migration already started in this release; abort' >&2; exit 1; }
    [[ ! -f "$gate" ]] || { echo 'Previous maintenance marker exists; manual intervention required' >&2; exit 1; }
    # Existing nginx bind mount exposes the updated config without recreation.
    docker exec gafus-nginx nginx -t
    docker exec gafus-nginx nginx -s reload
    touch "$gate"
    if ! check_gate; then
      rm -f "$gate" # No application was stopped yet.
      echo 'Maintenance verification failed; old runtime remains running.' >&2
      exit 1
    fi
    echo 'HTTPS maintenance 503 verified; draining existing work...'
    sleep 8
    compose_call stop -t 45 "${app_services[@]}"
    require_stopped_apps
    # Capture a consistent backup AFTER all write-capable apps have stopped.
    # Keep backups OUTSIDE the Git working tree: deployment git clean -fd
    # must never be able to delete the pre-migration rollback snapshot.
    backup="$release_dir/production-pre-migrate.dump"
    (umask 077; docker exec gafus-postgres pg_dump -U gafus -d gafus -Fc > "$backup")
    test -s "$backup"
    docker exec -i gafus-postgres pg_restore --list < "$backup" > /dev/null
    printf '%s\n' "$backup" > "$release_dir/database-backup-path"
    chmod 600 "$release_dir/database-backup-path"
    echo 'Writer-free PostgreSQL backup created; pg_restore TOC verified.'
    ;;
  migrate)
    require_gate
    require_stopped_apps
    [[ -s "$release_dir/database-backup-path" ]] || { echo 'Missing verified backup' >&2; exit 1; }
    test -s "$(cat "$release_dir/database-backup-path")"
    # Mark BEFORE running Prisma: other migrations may be partially applied.
    # Never auto-start old images once any schema mutation has begun.
    touch "$migration_marker"
    compose_call run --rm --no-deps prisma \
      /app/node_modules/.bin/prisma migrate deploy --schema=/app/schema.prisma
    touch "$migration_done"
    echo 'All pending Prisma migrations succeeded; old image rollback forbidden.'
    ;;
  start)
    require_gate
    test -f "$migration_done"
    compose_call up -d --no-deps --force-recreate worker api
    compose_call up -d --no-deps --force-recreate web trainer-panel admin-panel bull-board
    for app in "${app_services[@]}"; do check_health "$app"; done
    echo 'All new application containers healthy while ingress remains gated.'
    ;;
  verify)
    require_gate
    test -f "$migration_done"
    for app in "${app_services[@]}"; do check_health "$app"; done
    docker exec gafus-nginx nginx -t
    ;;
  open)
    require_gate
    test -f "$migration_done"
    for app in "${app_services[@]}"; do check_health "$app"; done
    rm -f "$gate"
    echo 'Maintenance removed after successful schema migration and container health checks.'
    ;;
  *)
    echo "Usage: $0 prepare|migrate|start|verify|open" >&2
    exit 2
    ;;
esac
