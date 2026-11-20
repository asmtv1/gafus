#!/usr/bin/env python3
"""Read-only fail-closed Prisma history gate; input is psql tab-separated output.

Input columns: migration_name, checksum, applied|rolled_back|failed.
The gate makes no DB connection or writes and never prints checksum values.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys

MIN_PRODUCTION_APPLIED = 162
# Prisma history includes one legitimate 8-digit 20251118 migration alongside
# standard 14-digit migration timestamps. Never reject this old applied name.
MIGRATION_NAME = re.compile(r"^[0-9]{8}(?:[0-9]{6})?_[A-Za-z0-9_-]+$")
CHECKSUM = re.compile(r"^[a-f0-9]{64}$")


LEGACY_MANIFEST_NAME = "ci-cd/scripts/approved-legacy-migration-baseline-20261115.json"


def approved_legacy_baseline(
    migrations_dir: pathlib.Path,
    live_schema_sha256: str | None,
) -> tuple[dict, dict] | None:
    """Permit only the approved six historical anomalies on the *exact* schema.

    No database connections, credentials, mutation or fallback to broad waivers.
    The caller must derive live_schema_sha256 from a read-only pg_dump --schema-only.
    An absent or different fingerprint never authorizes an exception.
    """
    if live_schema_sha256 is None:
        return None
    if not CHECKSUM.fullmatch(live_schema_sha256):
        raise ValueError("LIVE_SCHEMA_FINGERPRINT_INVALID")
    path = migrations_dir.resolve().parents[2] / LEGACY_MANIFEST_NAME
    if not path.is_file() or path.is_symlink():
        return None
    manifest = json.loads(path.read_text())
    if manifest.get("version") != 2:
        raise ValueError("LEGACY_MANIFEST_VERSION_INVALID")
    checkpoints = manifest.get("schemaCheckpoints")
    if not isinstance(checkpoints, dict):
        raise ValueError("LEGACY_MANIFEST_CHECKPOINTS_INVALID")
    if live_schema_sha256 not in checkpoints:
        return None
    checkpoint = checkpoints[live_schema_sha256]
    if (not isinstance(checkpoint, dict)
            or not CHECKSUM.fullmatch(str(checkpoint.get("ledgerSha256")))
            or any(type(checkpoint.get(key)) is not int or checkpoint[key] < 0
                   for key in ("expectedApplied", "expectedRolledBack", "expectedSources"))
            or not MIN_PRODUCTION_APPLIED <= checkpoint["expectedApplied"] <= checkpoint["expectedSources"]):
        raise ValueError("LEGACY_MANIFEST_CHECKPOINT_INVALID")
    # Pending SQL is authorized ONLY at an exact live-schema + complete ledger
    # checkpoint, by full migration name and immutable SQL SHA256. The original
    # single-migration checkpoint stays backward compatible; later approvals may
    # enumerate a *fixed* batch without allowing arbitrary new migrations.
    pending = checkpoint.get("approvedPendingMigration")
    batch = checkpoint.get("approvedPendingMigrations")
    if pending is not None and batch is not None:
        raise ValueError("LEGACY_MANIFEST_PENDING_CONFLICT")
    approved_pending = [pending] if pending is not None else (batch or [])
    if (batch is not None and (not isinstance(batch, list) or not 1 <= len(batch) <= 8)):
        raise ValueError("LEGACY_MANIFEST_PENDING_BATCH_INVALID")
    if approved_pending:
        if (checkpoint["expectedApplied"] != checkpoint["expectedSources"]
                or any(not isinstance(item, dict)
                       or set(item) != {"name", "sqlSha256"}
                       or not MIGRATION_NAME.fullmatch(str(item.get("name")))
                       or not CHECKSUM.fullmatch(str(item.get("sqlSha256")))
                       for item in approved_pending)
                or len({item["name"] for item in approved_pending}) != len(approved_pending)):
            raise ValueError("LEGACY_MANIFEST_PENDING_INVALID")
    entries = manifest.get("approvedLegacyChecksumExceptions")
    if not isinstance(entries, dict) or len(entries) != 6:
        raise ValueError("LEGACY_MANIFEST_EXCEPTIONS_INVALID")
    for name, entry in entries.items():
        if not MIGRATION_NAME.fullmatch(name) or not isinstance(entry, dict):
            raise ValueError("LEGACY_MANIFEST_ENTRY_INVALID")
        source_sha = entry.get("candidateSqlSha256")
        recorded = entry.get("recordedProductionChecksum")
        if not CHECKSUM.fullmatch(str(source_sha)) or not isinstance(recorded, str):
            raise ValueError("LEGACY_MANIFEST_SHA_INVALID")
        if not (CHECKSUM.fullmatch(recorded) or recorded in ("", "manual", name)):
            raise ValueError("LEGACY_MANIFEST_RECORDED_VALUE_INVALID")
    return entries, checkpoint


def legacy_exception_matches(
    exceptions: dict, name: str, checksum: str, candidate_sha: str
) -> bool:
    rule = exceptions.get(name)
    return bool(rule and rule.get("recordedProductionChecksum") == checksum
                and rule.get("candidateSqlSha256") == candidate_sha)


def verify(migrations_dir: pathlib.Path, lines: list[str], live_schema_sha256: str | None = None) -> tuple[int, int]:
    if not migrations_dir.is_dir():
        raise ValueError("MIGRATION_SOURCE_MISSING")
    source_files = {
        child.name: child / "migration.sql"
        for child in migrations_dir.iterdir()
        if child.is_dir() and MIGRATION_NAME.fullmatch(child.name)
    }
    if len(source_files) < MIN_PRODUCTION_APPLIED:
        raise ValueError("MIGRATION_SOURCE_INCOMPLETE")
    baseline = approved_legacy_baseline(migrations_dir, live_schema_sha256)
    exceptions, checkpoint = baseline if baseline else ({}, {})
    approved_exceptions: set[str] = set()
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
        path = source_files[name]
        if not path.is_file() or path.is_symlink():
            errors.append(f"MIGRATION_SQL_MISSING:{name}")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if CHECKSUM.fullmatch(checksum) and actual == checksum:
            continue
        if legacy_exception_matches(exceptions, name, checksum, actual):
            approved_exceptions.add(name)
            continue
        if not CHECKSUM.fullmatch(checksum):
            errors.append(f"NONSTANDARD_MIGRATION_CHECKSUM:{name}")
        else:
            errors.append(f"MIGRATION_SHA_MISMATCH:{name}")
    if len(applied) < MIN_PRODUCTION_APPLIED:
        errors.append(f"APPLIED_MIGRATION_COUNT_TOO_LOW:{len(applied)}")
    if approved_exceptions:
        canonical_ledger = "".join(row + "\n" for row in sorted(line.rstrip("\n") for line in lines))
        expected_sources = checkpoint["expectedSources"]
        pending = checkpoint.get("approvedPendingMigration")
        approved_pending = ([pending] if pending is not None
                            else checkpoint.get("approvedPendingMigrations", []))
        actual_pending = set(source_files) - applied
        extra_source_approved = bool(approved_pending) and (
            len(source_files) == expected_sources + len(approved_pending)
            and actual_pending == {item["name"] for item in approved_pending}
            and all((path := source_files.get(item["name"])) is not None
                    and path.is_file() and not path.is_symlink()
                    and hashlib.sha256(path.read_bytes()).hexdigest() == item["sqlSha256"]
                    for item in approved_pending)
        )
        if (approved_exceptions != set(exceptions)
                or len(applied) != checkpoint["expectedApplied"]
                or rolled_back != checkpoint["expectedRolledBack"]
                or not (len(source_files) == expected_sources or extra_source_approved)
                or hashlib.sha256(canonical_ledger.encode("utf-8")).hexdigest() != checkpoint["ledgerSha256"]):
            errors.append("LEGACY_APPROVAL_NOT_EXACT_PRODUCTION_BASELINE")
    if errors:
        raise ValueError(";".join(errors))
    if approved_exceptions:
        print("LEGACY_SCHEMA_ATTESTED_EXCEPTIONS:6:old-ledger-kept-unaltered")
    return len(applied), len(source_files) - len(applied)


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("USAGE: verify-production-migration-ledger.py /path/to/prisma/migrations [live-schema-sha256] < psql.tsv", file=sys.stderr)
        return 2
    try:
        live_schema_sha256 = sys.argv[2] if len(sys.argv) == 3 else None
        applied, pending = verify(
            pathlib.Path(sys.argv[1]), sys.stdin.readlines(), live_schema_sha256
        )
    except (ValueError, OSError) as exc:
        print(f"PRODUCTION_MIGRATION_LEDGER_VETO:{exc}", file=sys.stderr)
        return 1
    print(f"PRODUCTION_MIGRATION_LEDGER_PASS:applied={applied}:pending={pending}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
