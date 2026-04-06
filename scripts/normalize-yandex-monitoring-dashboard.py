#!/usr/bin/env python3
"""
Дополняет JSON дашборда после yc-monitoring-dashboard-importer под ожидания API/клиентов.

В proto PrometheusDataSource.step обязателен (мс); без него веб иногда прощает, мобильный — нет.
Также задаём явный тип графика и ось Y — меньше undefined в клиентском коде.
"""
from __future__ import annotations

import json
import pathlib
import sys

# Как refresh в Grafana JSON дашбордов (15s)
DEFAULT_PROMETHEUS_STEP_MS = 15_000


def normalize_widgets(widgets: list) -> None:
  for w in widgets:
    grp = w.get("group")
    if isinstance(grp, dict) and isinstance(grp.get("widgets"), list):
      normalize_widgets(grp["widgets"])

    msc = w.get("multi_source_chart")
    if not isinstance(msc, dict):
      continue

    for ds in msc.get("dataSources") or []:
      if not isinstance(ds, dict):
        continue
      pds = ds.get("prometheusDataSource")
      if isinstance(pds, dict) and "step" not in pds:
        pds["step"] = DEFAULT_PROMETHEUS_STEP_MS

    vs = msc.get("visualization_settings")
    if not isinstance(vs, dict):
      vs = {}
      msc["visualization_settings"] = vs

    vs["type"] = "VISUALIZATION_TYPE_LINE"

    ys = vs.get("yaxis_settings")
    if not isinstance(ys, dict):
      ys = {}
      vs["yaxis_settings"] = ys

    left = ys.get("left")
    if not isinstance(left, dict):
      left = {}
    left.setdefault("type", "YAXIS_TYPE_LINEAR")
    left.setdefault("unit_format", "UNIT_NONE")
    ys["left"] = left

    # Явно выключаем легенду — на мобильных часто падает разбор legend/table при неполных данных
    msc["display_legend"] = False
    # Пустой repeated лучше не слать — у части клиентов иной разбор optional/repeated
    if msc.get("series_overrides") == []:
      del msc["series_overrides"]


def main() -> None:
  if len(sys.argv) < 2:
    print("Usage: normalize-yandex-monitoring-dashboard.py <dashboard.json>", file=sys.stderr)
    sys.exit(1)
  path = pathlib.Path(sys.argv[1])
  data = json.loads(path.read_text(encoding="utf-8"))
  widgets = data.get("widgets")
  if isinstance(widgets, list):
    normalize_widgets(widgets)
  path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
  main()
