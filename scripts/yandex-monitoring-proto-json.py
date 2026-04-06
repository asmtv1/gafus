#!/usr/bin/env python3
"""
Приводит JSON тела Create/Update дашборда к соглашению Proto JSON (ключи lowerCamelCase).

Импортер и jq отдают snake_case (multi_source_chart, visualization_settings).
grpcurl это часто принимает, но клиенты (в т.ч. мобильный) могут ожидать camelCase.
Ключи в map labels не трогаем.
"""
from __future__ import annotations

import json
import sys


def snake_to_camel(name: str) -> str:
  if "_" not in name:
    return name
  parts = name.split("_")
  tail = "".join((p[:1].upper() + p[1:]) if p else "" for p in parts[1:])
  return parts[0] + tail


def transform(obj: object, inside_labels_map: bool = False) -> object:
  if isinstance(obj, dict):
    out: dict[str, object] = {}
    for k, v in obj.items():
      new_key = k if inside_labels_map else snake_to_camel(k)
      if k == "labels" and isinstance(v, dict) and not inside_labels_map:
        out[new_key] = transform(v, True)
      else:
        out[new_key] = transform(v, inside_labels_map)
    return out
  if isinstance(obj, list):
    return [transform(x, inside_labels_map) for x in obj]
  return obj


def main() -> None:
  data = json.load(sys.stdin)
  json.dump(transform(data), sys.stdout, ensure_ascii=False, separators=(",", ":"))
  sys.stdout.write("\n")


if __name__ == "__main__":
  main()
