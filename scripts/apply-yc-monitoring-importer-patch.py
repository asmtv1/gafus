#!/usr/bin/env python3
"""
Патч для yc-monitoring-dashboard-importer после git clone.

Без патча в виджетах уходит unit_format=null и type=9 для stat; в приложении
Yandex Cloud Monitoring это даёт runtime-ошибку (обращение к .length у undefined).
"""
from __future__ import annotations

import pathlib
import sys


def patch_monitoring_widget(importer_root: pathlib.Path) -> None:
  path = importer_root / "monitoring_widget.py"
  text = path.read_text(encoding="utf-8")

  old_type_block = """    def type_mapper(self, type):
            if type == 'stat':
                return 9
            else:
                return 'VISUALIZATION_TYPE_UNSPECIFIED'"""

  new_type_block = """    def type_mapper(self, type):
            # 9 вне enum VisualizationType (макс. 8); клиенты Yandex падают
            return 'VISUALIZATION_TYPE_UNSPECIFIED'"""

  old_unit_block = """    def unit_mapper(self, grafana_unit: str):
        
        units_map = {
            'percentunit': 'UNIT_PERCENT',
            'None': 'UNIT_NONE',
            'bytes': 'UNIT_BYTES_IEC',
            'Bps': 'UNIT_BYTES_SI_PER_SECOND',
            'iops': 'UNIT_IO_OPERATIONS_PER_SECOND',
            'pps': 'UNIT_PACKETS_PER_SECOND',
            '':''
        }
        
        return units_map.get(grafana_unit)"""

  new_unit_block = """    def unit_mapper(self, grafana_unit: str):
        units_map = {
            'percentunit': 'UNIT_PERCENT_UNIT',
            'none': 'UNIT_NONE',
            'None': 'UNIT_NONE',
            'percent': 'UNIT_PERCENT',
            'bytes': 'UNIT_BYTES_IEC',
            'Bps': 'UNIT_BYTES_SI_PER_SECOND',
            'iops': 'UNIT_IO_OPERATIONS_PER_SECOND',
            'pps': 'UNIT_PACKETS_PER_SECOND',
            's': 'UNIT_SECONDS',
            'ms': 'UNIT_MILLISECONDS',
            'short': 'UNIT_NONE',
            'ops': 'UNIT_OPERATIONS_PER_SECOND',
            '': '',
        }
        if grafana_unit is None:
            return 'UNIT_NONE'
        if grafana_unit in units_map:
            return units_map[grafana_unit]
        return 'UNIT_NONE'"""

  changed = False
  if old_type_block in text:
    text = text.replace(old_type_block, new_type_block)
    changed = True
  if old_unit_block in text:
    text = text.replace(old_unit_block, new_unit_block)
    changed = True

  if changed:
    path.write_text(text, encoding="utf-8")
    print("apply-yc-monitoring-importer-patch: monitoring_widget.py обновлён")
  elif "'none': 'UNIT_NONE'" in text and "return 9" not in text:
    print("apply-yc-monitoring-importer-patch: патч уже применён")
  else:
    print(
      "apply-yc-monitoring-importer-patch: не удалось сопоставить monitoring_widget.py",
      file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
  if len(sys.argv) < 2:
    print("Usage: apply-yc-monitoring-importer-patch.py <importer_dir>", file=sys.stderr)
    sys.exit(1)
  root = pathlib.Path(sys.argv[1])
  if not (root / "monitoring_widget.py").is_file():
    print(f"apply-yc-monitoring-importer-patch: нет {root}/monitoring_widget.py", file=sys.stderr)
    sys.exit(1)
  patch_monitoring_widget(root)


if __name__ == "__main__":
  main()
