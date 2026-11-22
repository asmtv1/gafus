#!/usr/bin/env python3
"""Safely provision a stable, private API metrics token for a Compose release.

Never prints the token. When a generated release env has no key, preserve the
previous deployed key; on first deployment generate a cryptographically random
key. Explicitly provisioned new tokens take precedence for controlled rotation.
"""
from __future__ import annotations

import re
import secrets
import sys
from pathlib import Path


def read_key(path: Path) -> str | None:
    if path.is_symlink():
        raise ValueError("ENV_FILE_SYMLINK_FORBIDDEN")
    if not path.is_file():
        return None
    lines = [line.partition("=")[2] for line in path.read_text().splitlines()
             if line.startswith("API_METRICS_KEY=")]
    if len(lines) > 1:
        raise ValueError("API_METRICS_KEY_DUPLICATED")
    value = lines[0] if lines else None
    if value and not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", value):
        raise ValueError("API_METRICS_KEY_INVALID")
    return value or None


def provision(target: Path, previous: Path) -> str:
    if not target.is_file() or target.is_symlink():
        raise ValueError("RELEASE_ENV_UNSAFE_OR_MISSING")
    current = read_key(target)
    old = read_key(previous)
    key = current or old or secrets.token_hex(32)
    original = target.read_text().splitlines()
    lines = [line for line in original if not line.startswith("API_METRICS_KEY=")]
    lines.append("API_METRICS_KEY=" + key)
    target.write_text("\n".join(lines) + "\n")
    target.chmod(0o600)
    return "existing-release" if current else ("preserved" if old else "generated")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("USAGE: provision-api-metrics-key.py RELEASE_ENV PREVIOUS_ENV")
        status = provision(Path(sys.argv[1]), Path(sys.argv[2]))
        print("API_METRICS_KEY_READY:" + status)
    except (ValueError, OSError) as exc:
        # All errors are static reasons, never keys or file contents.
        print("API_METRICS_KEY_PROVISION_FAILED:" + type(exc).__name__, file=sys.stderr)
        sys.exit(1)
