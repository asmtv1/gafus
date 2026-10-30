#!/usr/bin/env python3
"""INFRA032: copy ONLY archived Prisma ledger into private memory. No DB or logs output.

Never execute restored SQL, read another table, publish Prisma `logs`, or write raw COPY.
The only emitted per-row fields are migration_name/checksum/timestamps/steps.
"""
from __future__ import annotations

import hashlib
import re
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
DUMP = ROOT / 'gafus dump'
MIGRATIONS = ROOT / 'packages/prisma/migrations'
LEDGER_TABLE = '_prisma_migrations'
ALLOWED = ('migration_name', 'checksum', 'started_at', 'finished_at', 'rolled_back_at', 'applied_steps_count')
REQUIRED = set(ALLOWED) | {'id', 'logs'}
MAX_STDOUT_BYTES = 8 * 1024 * 1024
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$')
HEX = re.compile(r'^[a-f0-9]{64}$')
TOC = re.compile(r'^\d+;\s+\d+\s+\d+\s+TABLE DATA public _prisma_migrations(?:\s|$)', re.M)
COPY = re.compile(r'^COPY public\.(?:"_prisma_migrations"|_prisma_migrations) \(([^\n]+)\) FROM stdin;$', re.M)


def stop(code: str):
    raise RuntimeError('INFRA032_LEDGER_' + code)


def choose_archive() -> Path:
    if Path.cwd().resolve() != ROOT or DUMP.is_symlink() or not DUMP.is_dir():
        stop('PROJECT_OR_DIRECTORY')
    children = list(DUMP.iterdir())
    if len(children) != 2 or any(p.is_symlink() or not p.is_file() for p in children):
        stop('UNSAFE_ARCHIVE_ENTRIES')
    archives = [p for p in children if p.suffix == '.dump']
    if len(archives) != 1:
        stop('NOT_ONE_CUSTOM_ARCHIVE')
    with archives[0].open('rb') as f:
        if f.read(5) != b'PGDMP':
            stop('NOT_CUSTOM_PGDMP')
    return archives[0]


def pg_restore(*args: str) -> str:
    # Capture in private process memory; never emit subprocess stdout/stderr or
    # dump owner, logs or raw COPY values. No PG host/database flags are accepted.
    try:
        result = subprocess.run(
            ['pg_restore', *args], capture_output=True, timeout=25, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        stop('PG_RESTORE_UNAVAILABLE')
    if result.returncode != 0 or len(result.stdout) > MAX_STDOUT_BYTES:
        stop('PG_RESTORE_FAILED_OR_OVERSIZED')
    try:
        return result.stdout.decode('utf-8', 'strict')
    except UnicodeError:
        stop('INVALID_UTF8')


def unescape_copy(value: str) -> str | None:
    if value == r'\N':
        return None
    # PostgreSQL COPY text escapes. Column position comes from the exact COPY
    # header and is validated before any raw field can be selected.
    out = []
    i = 0
    basic = {'t': '\t', 'n': '\n', 'r': '\r', 'b': '\b', 'f': '\f', 'v': '\v', '\\': '\\'}
    while i < len(value):
        if value[i] != '\\':
            out.append(value[i]); i += 1; continue
        i += 1
        if i == len(value):
            stop('BAD_COPY_ESCAPE')
        ch = value[i]; i += 1
        if ch in basic:
            out.append(basic[ch]); continue
        if ch == 'x':
            m = re.match(r'^[0-9a-fA-F]{1,2}', value[i:])
            if not m: stop('BAD_COPY_HEX')
            out.append(chr(int(m.group(), 16))); i += len(m.group()); continue
        if ch in '01234567':
            m = re.match(r'^[0-7]{0,2}', value[i:])
            octal = ch + (m.group() if m else '')
            out.append(chr(int(octal, 8))); i += len(octal) - 1; continue
        out.append(ch)
    return ''.join(out)


def parse_exact_ledger_copy(payload: str) -> list[dict[str, str | None]]:
    matches = list(COPY.finditer(payload))
    if len(matches) != 1:
        stop('COPY_TABLE_NOT_EXACT')
    header = matches[0]
    columns = [v.strip().strip('"') for v in header.group(1).split(',')]
    if len(columns) != 8 or set(columns) != REQUIRED or len(set(columns)) != 8:
        stop('COPY_COLUMNS_NOT_EXACT')
    lines = payload[header.end():].splitlines()
    if lines and lines[0] == '':
        lines.pop(0)
    if lines.count(r'\.') != 1:
        stop('COPY_TERMINATOR_MISSING')
    terminator = lines.index(r'\.')
    # No other COPY, INSERT, SQL rows or extra data commands before/after.
    outside = payload[:header.start()] + '\n'.join(lines[terminator+1:])
    for statement in ('COPY ', 'INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE ', 'SELECT *', 'CREATE TABLE'):
        if re.search(r'(?m)^\s*' + re.escape(statement), outside):
            stop('UNEXPECTED_OTHER_TABLE_DATA')
    rows: list[dict[str, str | None]] = []
    unique = set()
    for line in lines[:terminator]:
        parts = line.split('\t')
        if len(parts) != 8:
            stop('BAD_COPY_ROW_ARITY')
        # IMPORTANT: Decode ONLY the six whitelisted fields. In particular logs
        # is never unescaped, output, persisted, used for an error, or returned.
        row = {key: unescape_copy(parts[columns.index(key)]) for key in ALLOWED}
        name = row['migration_name']; checksum = row['checksum']
        if not isinstance(name, str) or not NAME.fullmatch(name): stop('BAD_MIGRATION_NAME')
        # Some historical Prisma ledger rows contain non-SHA placeholders or
        # empty checksums. Keep their existence but never treat as verified.
        if not isinstance(checksum, str) or len(checksum) > 256:
            stop('INVALID_CHECKSUM_FIELD')
        # Prisma can retain multiple attempts for one migration_name (failed,
        # rolled back, then re-applied). Validate unique ledger ROW ids instead.
        raw_id = parts[columns.index('id')]
        if raw_id in unique: stop('DUPLICATE_LEDGER_ROW_ID')
        unique.add(raw_id)
        for field in ('started_at', 'finished_at', 'rolled_back_at'):
            value = row[field]
            if value is None:
                if field == 'started_at': stop('MISSING_START_TIME')
                continue
            try:
                # PostgreSQL emits a short timezone suffix (e.g. +00), while
                # Python's strict ISO parser requires +00:00.
                normalized = value.replace(' ', 'T')
                normalized = re.sub(r'([+-]\d{2})$', r'\1:00', normalized)
                normalized = re.sub(r'([+-]\d{2})(\d{2})$', r'\1:\2', normalized)
                normalized = re.sub(
                    r'\.(\d{1,5})(?=[+-]\d{2}:\d{2}$)',
                    lambda match: '.' + match.group(1).ljust(6, '0'), normalized,
                )
                timestamp = datetime.fromisoformat(normalized)
                if timestamp.tzinfo is None: stop('NAIVE_TIMESTAMP')
            except ValueError:
                stop('INVALID_TIMESTAMP')
        steps = row['applied_steps_count']
        if not isinstance(steps, str) or not re.fullmatch(r'\d{1,9}', steps):
            stop('BAD_STEP_COUNT')
        rows.append(row)
    return rows


def collect_metadata() -> tuple[list[dict[str, str | None]], dict]:
    archive = choose_archive()
    toc = pg_restore('--list', str(archive))
    if len(TOC.findall(toc)) != 1:
        stop('TOC_LEDGER_TABLE_NOT_UNIQUE')
    # --schema/--table and --data-only select *only* the Prisma ledger TABLE DATA;
    # the COPY header, column whitelist and one terminator are validated again.
    raw = pg_restore('--data-only', '--schema=public', '--table=_prisma_migrations',
                     '--file=-', str(archive))
    rows = parse_exact_ledger_copy(raw)
    repo = {}
    for p in MIGRATIONS.iterdir():
        if p.is_symlink(): stop('MIGRATION_DIRECTORY_SYMLINK')
        sql = p / 'migration.sql'
        if not p.is_dir() or not sql.is_file(): continue
        if sql.is_symlink(): stop('MIGRATION_FILE_SYMLINK')
        repo[p.name] = hashlib.sha256(sql.read_bytes()).hexdigest()
    if not repo: stop('NO_LOCAL_MIGRATIONS')
    applied = [r for r in rows if r['finished_at'] is not None and r['rolled_back_at'] is None]
    rolled_back = [r for r in rows if r['rolled_back_at'] is not None]
    incomplete = [r for r in rows if r['finished_at'] is None and r['rolled_back_at'] is None]
    applied_names = {r['migration_name'] for r in applied}
    prod_only = [r for r in applied if r['migration_name'] not in repo]
    noncanonical = [r for r in applied if not HEX.fullmatch(r['checksum'])]
    mismatch = [r for r in applied if r['migration_name'] in repo
                and HEX.fullmatch(r['checksum']) and repo[r['migration_name']] != r['checksum']]
    missing = sorted(set(repo) - applied_names)
    duplicated_applied = sorted({r['migration_name'] for r in applied
                                 if sum(v['migration_name'] == r['migration_name'] for v in applied) > 1})
    return rows, {
        'repository_sql_files': len(repo), 'ledger_rows': len(rows),
        'applied': len(applied), 'rolled_back': len(rolled_back), 'incomplete': len(incomplete),
        'applied_prod_only': prod_only, 'same_name_checksum_mismatch': mismatch,
        'noncanonical_applied_checksums': noncanonical,
        'duplicated_applied_names': duplicated_applied,
        'local_not_applied_as_of_dump': missing,
        'applied_matched_checksum': sum(r['migration_name'] in repo and
                                        HEX.fullmatch(r['checksum']) is not None and
                                        repo[r['migration_name']] == r['checksum'] for r in applied),
    }


def main() -> None:
    import sys
    if len(sys.argv) != 2 or sys.argv[1] != '--ledger-only':
        stop('LEDGER_ONLY_NO_RESTORE')
    rows, result = collect_metadata()
    print('LEDGER_METADATA_ONLY=YES DB_CONNECTED=NO RESTORE=NO OTHER_TABLES=NOT_EXTRACTED LOGS=NOT_OUTPUT')
    for key in ('repository_sql_files','ledger_rows','applied','rolled_back','incomplete','applied_matched_checksum'):
        print(f'{key}={result[key]}')
    print('MIGRATION_METADATA_FIELDS=' + ','.join(ALLOWED))
    for row in sorted(rows, key=lambda r: (str(r['started_at']), str(r['migration_name']))):
        fields = []
        for field in ALLOWED:
            value = row[field]
            if field == 'checksum' and not HEX.fullmatch(value):
                value = f'NONCANONICAL_LENGTH_{len(value)}'
            fields.append(str(value) if value is not None else 'NULL')
        print('LEDGER\t' + '\t'.join(fields))
    for name, items in (('APPLIED_NOT_IN_REPO', result['applied_prod_only']),
                        ('CHECKSUM_MISMATCH', result['same_name_checksum_mismatch'])):
        for row in items:
            print(name + '\t' + str(row['migration_name']) + '\t' + str(row['checksum']))
    for row in result['noncanonical_applied_checksums']:
        print('NONCANONICAL_APPLIED_CHECKSUM\t' + str(row['migration_name']) +
              '\tlength=' + str(len(row['checksum'])))
    for name in result['duplicated_applied_names']:
        print('DUPLICATE_FINISHED_NAME\t' + name)
    for name in result['local_not_applied_as_of_dump']:
        print('LOCAL_NOT_APPLIED_AS_OF_DUMP\t' + name)

if __name__ == '__main__':
    try:
        main()
    except RuntimeError as ex:
        # The exception only contains a static error code, never subprocess output.
        raise SystemExit(str(ex)) from None
