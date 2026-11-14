#!/usr/bin/env python3
"""Read-only fail-closed Prisma history gate; input is psql tab-separated output.

Input columns: migration_name, checksum, applied|rolled_back|failed.
The gate makes no DB connection or writes and never prints checksum values.
"""
from __future__ import annotations

import hashlib
import pathlib
import re
import sys

MIN_PRODUCTION_APPLIED = 162
# Prisma history includes one legitimate 8-digit 20251118 migration alongside
# standard 14-digit migration timestamps. Never reject this old applied name.
MIGRATION_NAME = re.compile(r"^[0-9]{8}(?:[0-9]{6})?_[A-Za-z0-9_-]+$")
CHECKSUM = re.compile(r"^[a-f0-9]{64}$")


def verify(migrations_dir: pathlib.Path, lines: list[str]) -> tuple[int, int]:
    if not migrations_dir.is_dir():
        raise ValueError("MIGRATION_SOURCE_MISSING")
    source_files = {
        child.name: child / "migration.sql"
        for child in migrations_dir.iterdir()
        if child.is_dir() and MIGRATION_NAME.fullmatch(child.name)
    }
    if len(source_files) < MIN_PRODUCTION_APPLIED:
        raise ValueError("MIGRATION_SOURCE_INCOMPLETE")
    applied: set[str] = set()
    rolled_back = 0
    errors: list[str] = []
    if not lines:
        raise ValueError("MIGRATION_LEDGER_EMPTY")
    for number, line in enumerate(lines, start=1):
        fields = line.rstrip("\n").split("\t")
        if len(fields) != 3:
            errors.append(f"INVALID_LEDGER_ROW:{number}")
            continue
        name, checksum, state = fields
        if not MIGRATION_NAME.fullmatch(name):
            errors.append(f"INVALID_MIGRATION_NAME:{number}")
            continue
        if state == "rolled_back":
            rolled_back += 1
            continue
        if state != "applied":
            errors.append(f"UNFINISHED_MIGRATION:{name}")
            continue
        if name in applied:
            errors.append(f"DUPLICATE_APPLIED_MIGRATION:{name}")
            continue
        applied.add(name)
        if name not in source_files:
            errors.append(f"REMOTE_ONLY_MIGRATION:{name}")
            continue
        if not CHECKSUM.fullmatch(checksum):
            errors.append(f"NONSTANDARD_MIGRATION_CHECKSUM:{name}")
            continue
        path = source_files[name]
        if not path.is_file() or path.is_symlink():
            errors.append(f"MIGRATION_SQL_MISSING:{name}")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != checksum:
            errors.append(f"MIGRATION_SHA_MISMATCH:{name}")
    if len(applied) < MIN_PRODUCTION_APPLIED:
        errors.append(f"APPLIED_MIGRATION_COUNT_TOO_LOW:{len(applied)}")
    if errors:
        raise ValueError(";".join(errors))
    return len(applied), len(source_files) - len(applied)


def main() -> int:
    if len(sys.argv) != 2:
        print("USAGE: verify-production-migration-ledger.py /path/to/prisma/migrations < psql.tsv", file=sys.stderr)
        return 2
    try:
        applied, pending = verify(pathlib.Path(sys.argv[1]), sys.stdin.readlines())
    except (ValueError, OSError) as exc:
        print(f"PRODUCTION_MIGRATION_LEDGER_VETO:{exc}", file=sys.stderr)
        return 1
    print(f"PRODUCTION_MIGRATION_LEDGER_PASS:applied={applied}:pending={pending}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
