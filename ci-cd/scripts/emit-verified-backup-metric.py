#!/usr/bin/env python3
"""Emit node_exporter textfile ONLY after Yandex metadata size/type verification.

No DB connection, cloud access, credentials, resource identifier or upload URL.
The directory must already exist and be mounted read-only into a local
node_exporter with --collector.textfile.directory=... .
"""
from __future__ import annotations

import os
import pathlib
import stat
import tempfile
import time


def emit(directory: str, timestamp: int | None = None) -> pathlib.Path:
    root = pathlib.Path(directory)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("BACKUP_METRICS_DIRECTORY_INVALID")
    # macOS /tmp and /var are system-managed symlinks to /private; the
    # directory itself must not be a symlink, but parents may be.
    if stat.S_IMODE(root.stat().st_mode) & 0o002:
        raise ValueError("BACKUP_METRICS_DIRECTORY_WORLD_WRITABLE")
    now = int(time.time()) if timestamp is None else timestamp
    if not isinstance(now, int) or now <= 0:
        raise ValueError("BACKUP_METRICS_TIMESTAMP_INVALID")
    content = (
        "# HELP gafus_database_backup_last_success_timestamp_seconds "
        "Unix time of the last remotely verified PostgreSQL backup\n"
        "# TYPE gafus_database_backup_last_success_timestamp_seconds gauge\n"
        f"gafus_database_backup_last_success_timestamp_seconds {now}\n"
    )
    fd, tmp = tempfile.mkstemp(prefix=".backup-verified-", dir=str(root))
    try:
        with os.fdopen(fd, "w", encoding="ascii") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp, 0o644)  # Non-sensitive numerical timestamp only.
        target = root / "gafus_backup_verified.prom"
        os.replace(tmp, target)
        return target
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


if __name__ == "__main__":
    emit(os.environ["GAFUS_BACKUP_METRICS_DIR"])
    print("BACKUP_LAST_SUCCESS_METRIC_RECORDED")
