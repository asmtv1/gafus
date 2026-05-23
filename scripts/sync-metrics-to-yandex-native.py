#!/usr/bin/env python3
"""
Синхронизирует метрики из Prometheus workspace в нативный Yandex Monitoring.
Запускается как cron-задача каждые 60 секунд в Docker.

Prometheus workspace → native Yandex Monitoring v2 API
Это нужно, чтобы мобильное приложение Yandex Cloud могло читать метрики
через ChartWidget (native monitoring), а не MultiSourceChartWidget (Prometheus).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FOLDER_ID = os.environ.get("YC_FOLDER_ID", "b1g0vbm2pvav4oqc4ds9")
WORKSPACE_ID = os.environ.get("YC_PROMETHEUS_WORKSPACE_ID", "monj8dpjri8u0bbqvq71")
API_KEY = os.environ.get("YC_MONITORING_API_KEY", "")

PROMETHEUS_QUERY_URL = (
    f"https://monitoring.api.cloud.yandex.net"
    f"/prometheus/workspaces/{WORKSPACE_ID}/api/v1/query"
)
NATIVE_WRITE_URL = (
    f"https://monitoring.api.cloud.yandex.net"
    f"/monitoring/v2/data/write?folderId={FOLDER_ID}&service=custom"
)

# Метрики для синхронизации: (нативное имя, PromQL запрос)
METRICS: list[tuple[str, str]] = [
    (
        "gafus_web_up",
        'probe_success{job="services-health",service="web-app"}',
    ),
    (
        "gafus_api_up",
        'probe_success{job="services-health",service="api"}',
    ),
    (
        "gafus_worker_up",
        'probe_success{job="services-health",service="worker"}',
    ),
    (
        "gafus_bull_board_up",
        'probe_success{job="services-health",service="bull-board"}',
    ),
    (
        "gafus_postgres_up",
        "pg_up",
    ),
    (
        "gafus_cpu_percent",
        '100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    ),
    (
        "gafus_ram_percent",
        "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
    ),
    (
        "gafus_disk_free_percent",
        (
            'node_filesystem_avail_bytes{mountpoint="/"}'
            ' / node_filesystem_size_bytes{mountpoint="/"} * 100'
        ),
    ),
]


def _get_iam_from_metadata() -> str | None:
    """Получает IAM-токен из metadata-сервиса (работает на VM Yandex Cloud)."""
    try:
        req = urllib.request.Request(
            "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
            headers={"Metadata-Flavor": "Google"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read())
            return data.get("access_token")
    except Exception:
        return None


def _get_auth_header() -> str:
    """Возвращает заголовок Authorization для нативного Yandex Monitoring."""
    iam = _get_iam_from_metadata()
    if iam:
        return f"Bearer {iam}"
    if API_KEY:
        return f"Bearer {API_KEY}"
    raise RuntimeError(
        "Нет доступных методов аутентификации. "
        "Установите YC_MONITORING_API_KEY или запустите на VM с привязанным SA."
    )


def _query_prometheus(promql: str) -> float | None:
    """Выполняет instant-запрос к Prometheus workspace, возвращает float или None."""
    params = urllib.parse.urlencode({"query": promql, "time": str(int(time.time()))})
    url = f"{PROMETHEUS_QUERY_URL}?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {API_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            results = data.get("data", {}).get("result", [])
            if results:
                raw = results[0]["value"][1]
                val = float(raw)
                return None if (val != val) else val  # NaN guard
    except urllib.error.HTTPError as exc:
        print(f"  [WARN] Prometheus query failed ({exc.code}): {promql[:60]}", file=sys.stderr)
    except Exception as exc:
        print(f"  [WARN] Prometheus error: {exc}", file=sys.stderr)
    return None


def _write_to_native(metrics: list[dict], auth: str | None = None) -> bool:
    """Записывает метрики в нативный Yandex Monitoring v2."""
    if auth is None:
        auth = _get_auth_header()
    body = json.dumps({"metrics": metrics}).encode()
    req = urllib.request.Request(
        NATIVE_WRITE_URL,
        data=body,
        headers={"Authorization": auth, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            written = data.get("writtenMetricsCount", 0)
            print(f"  [OK] Записано метрик: {written}")
            return True
    except urllib.error.HTTPError as exc:
        body_err = exc.read().decode(errors="replace")
        # Если Bearer не сработал — повторяем с Api-Key (для статических ключей SA)
        if exc.code == 401 and API_KEY and auth.startswith("Bearer "):
            print(f"  [WARN] Bearer auth failed, retrying with Api-Key...", file=sys.stderr)
            return _write_to_native(metrics, auth=f"Api-Key {API_KEY}")
        print(f"  [ERROR] Write failed {exc.code}: {body_err}", file=sys.stderr)
    except Exception as exc:
        print(f"  [ERROR] Write error: {exc}", file=sys.stderr)
    return False


def main() -> int:
    print(f"[sync] Начало синхронизации — {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")

    if not API_KEY:
        print("[WARN] YC_MONITORING_API_KEY не задан — Prometheus-запросы будут без авторизации", file=sys.stderr)

    payload: list[dict] = []

    for name, promql in METRICS:
        value = _query_prometheus(promql)
        if value is not None:
            payload.append({
                "name": name,
                "labels": {},
                "value": round(value, 4),
                "type": "DGAUGE",
            })
            print(f"  {name} = {value:.4f}")
        else:
            print(f"  {name} = (нет данных)", file=sys.stderr)

    if not payload:
        print("[WARN] Нет метрик для записи — пропускаем цикл", file=sys.stderr)
        return 0

    success = _write_to_native(payload)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
