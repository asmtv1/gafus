#!/usr/bin/env python3
"""
Удаляет ВСЕ дашборды в папке Yandex Cloud Monitoring и создаёт один GENERAL.

Использует ChartWidget с нативными запросами Yandex Monitoring
(а не MultiSourceChartWidget с PrometheusTarget).
Это необходимо для корректного отображения в мобильном приложении Yandex Cloud:
мобильный клиент поддерживает только ChartWidget, не MultiSourceChartWidget.

Метрики пишутся в нативный Yandex Monitoring через scripts/sync-metrics-to-yandex-native.py.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

FOLDER_ID = os.environ.get("FOLDER_ID", "b1g0vbm2pvav4oqc4ds9")
CLOUDAPI   = os.environ.get("CLOUDAPI",  "/tmp/cloudapi")
GRPC_HOST  = "monitoring.api.cloud.yandex.net:443"
PROTO_FILE = f"{CLOUDAPI}/yandex/cloud/monitoring/v3/dashboard_service.proto"


# ── gRPC helper ───────────────────────────────────────────────────────────────

def grpc(token: str, method: str, body: dict) -> dict:
  cmd = [
    "grpcurl",
    "-rpc-header", f"Authorization: Bearer {token}",
    "-import-path", CLOUDAPI,
    "-import-path", f"{CLOUDAPI}/third_party/googleapis",
    "-proto", PROTO_FILE,
    "-d", "@",
    GRPC_HOST,
    f"yandex.cloud.monitoring.v3.DashboardService.{method}",
  ]
  res = subprocess.run(cmd, input=json.dumps(body).encode(), capture_output=True)
  if res.returncode != 0:
    raise RuntimeError(res.stderr.decode())
  raw = res.stdout.decode().strip()
  return json.loads(raw) if raw else {}


def get_iam_token() -> str:
  res = subprocess.run(["yc", "iam", "create-token"], capture_output=True, text=True)
  if res.returncode != 0:
    print("❌ yc iam create-token:", res.stderr)
    sys.exit(1)
  return res.stdout.strip()


# ── Строительные блоки ChartWidget ────────────────────────────────────────────

def native_target(metric_name: str, name: str = "A") -> dict:
  """Нативный запрос Yandex Monitoring. Метрики пишет sync-metrics-to-yandex-native.py.

  Обязательны folderId и service (см. docs: querying.md — селектор метрик).
  Без folderId консоль и виджеты показывают «Нет данных».
  """
  return {
    "query":     f'"{metric_name}"{{folderId="{FOLDER_ID}", service="custom"}}',
    "text_mode": False,
    "hidden":    False,
    "name":      name,
  }


def downsampling(aggregation: str = "GRID_AGGREGATION_AVG") -> dict:
  return {
    "max_points":       200,
    "grid_aggregation": aggregation,
    "gap_filling":      "GAP_FILLING_PREVIOUS",
  }


def viz(
  unit: str = "UNIT_NONE",
  min_val: str | None = None,
  max_val: str | None = None,
) -> dict:
  left: dict = {"type": "YAXIS_TYPE_LINEAR", "unit_format": unit}
  if min_val is not None:
    left["min"] = min_val
  if max_val is not None:
    left["max"] = max_val
  return {
    "type":           "VISUALIZATION_TYPE_LINE",
    "interpolate":    "INTERPOLATE_LINEAR",
    "yaxis_settings": {"left": left},
    "color_scheme_settings": {"automatic": {}},
  }


def widget(
  wid: int,
  title: str,
  x: int, y: int, w: int, h: int,
  native_metric: str,
  unit: str = "UNIT_NONE",
  min_val: str | None = None,
  max_val: str | None = None,
  display_legend: bool = False,
  aggregation: str = "GRID_AGGREGATION_AVG",
) -> dict:
  return {
    "position": {"x": x, "y": y, "w": w, "h": h},
    "chart": {
      "id":    str(wid),
      "title": title,
      "queries": {
        "targets":      [native_target(native_metric)],
        "downsampling": downsampling(aggregation),
      },
      "visualization_settings": viz(unit, min_val, max_val),
      "series_overrides":       [],
      "display_legend":         display_legend,
    },
  }


# ── Определение дашборда ──────────────────────────────────────────────────────

def build_dashboard() -> dict:
  """
  Раскладка (24 колонки):
  y=0  h=5  Web(w=6) | API(w=6) | Worker(w=6) | Bull Board(w=6)
  y=5  h=5  PostgreSQL(w=8) | CPU %(w=8) | RAM %(w=8)
  y=10 h=6  Диск свободно %(w=24)

  Метрики: gafus_* — кастомные метрики из sync-metrics-to-yandex-native.py.
  """
  widgets = [
    # — Доступность сервисов —————————————————————————————————————
    widget(1, "Web",
           x=0,  y=0, w=6, h=5,
           native_metric="gafus_web_up",
           min_val="0", max_val="1",
           aggregation="GRID_AGGREGATION_LAST"),
    widget(2, "API",
           x=6,  y=0, w=6, h=5,
           native_metric="gafus_api_up",
           min_val="0", max_val="1",
           aggregation="GRID_AGGREGATION_LAST"),
    widget(3, "Worker",
           x=12, y=0, w=6, h=5,
           native_metric="gafus_worker_up",
           min_val="0", max_val="1",
           aggregation="GRID_AGGREGATION_LAST"),
    widget(4, "Bull Board",
           x=18, y=0, w=6, h=5,
           native_metric="gafus_bull_board_up",
           min_val="0", max_val="1",
           aggregation="GRID_AGGREGATION_LAST"),

    # — Инфраструктура ————————————————————————————————————————————
    widget(5, "PostgreSQL",
           x=0,  y=5, w=8, h=5,
           native_metric="gafus_postgres_up",
           min_val="0", max_val="1",
           aggregation="GRID_AGGREGATION_LAST"),
    widget(6, "CPU (%)",
           x=8,  y=5, w=8, h=5,
           native_metric="gafus_cpu_percent",
           unit="UNIT_PERCENT", min_val="0", max_val="100"),
    widget(7, "RAM (%)",
           x=16, y=5, w=8, h=5,
           native_metric="gafus_ram_percent",
           unit="UNIT_PERCENT", min_val="0", max_val="100"),

    widget(8, "Диск свободно (%)",
           x=0,  y=10, w=24, h=6,
           native_metric="gafus_disk_free_percent",
           unit="UNIT_PERCENT", min_val="0", max_val="100"),
  ]
  return {
    "folder_id":       FOLDER_ID,
    "name":            "general",
    "title":           "GENERAL",
    "description":     "Доступность сервисов и состояние инфраструктуры",
    "labels":          {},
    "widgets":         widgets,
    "parametrization": {},
  }


# ── Основная логика ────────────────────────────────────────────────────────────

def main() -> None:
  token = get_iam_token()

  print("📂 Загрузка списка дашбордов...")
  resp       = grpc(token, "List", {"folder_id": FOLDER_ID, "page_size": 1000})
  dashboards = resp.get("dashboards") or []
  print(f"   Найдено: {len(dashboards)}")

  for d in dashboards:
    name = d.get("name") or d.get("id")
    did  = d["id"]
    etag = d.get("etag", "")
    try:
      grpc(token, "Delete", {"dashboard_id": did, "etag": etag})
      print(f"  🗑  Удалён: {name}")
    except RuntimeError as exc:
      print(f"  ⚠️  Не удалось удалить {name}: {exc}")

  print("\n📊 Создание дашборда GENERAL (ChartWidget + нативный мониторинг)...")
  body = build_dashboard()
  try:
    result  = grpc(token, "Create", body)
    meta    = result.get("metadata") or {}
    dash_id = meta.get("dashboardId") or result.get("id") or "—"
    print(f"  ✅ Создан (id: {dash_id})")
    print()
    print("  Виджеты используют нативный Yandex Monitoring (ChartWidget).")
    print("  Данные появятся через ~60 сек после запуска yandex-metrics-sync.")
  except RuntimeError as exc:
    print(f"  ❌ Ошибка: {exc}")
    sys.exit(1)


if __name__ == "__main__":
  main()
