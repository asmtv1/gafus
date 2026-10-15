#!/usr/bin/env python3
"""
Extract SQL objects Prisma db push cannot model from historical GAFUS migrations.
The generated file is only for EMPTY database bootstrap, never existing installs.
Use --check in CI to reject undocumented migration-only DB object drift.
"""
import argparse
import pathlib
import re
import sys

base = pathlib.Path(__file__).resolve().parents[1]
migrations = base / "migrations"
target = pathlib.Path(__file__).resolve().parent / "fresh-db-extras.sql"


def statements(source: str):
    start = 0
    i = 0
    quote = None
    while i < len(source):
        char = source[i]
        if quote is None:
            if source.startswith("--", i):
                j = source.find("\n", i)
                i = len(source) if j == -1 else j + 1
                continue
            if char in ("'", '"'):
                quote = char
            elif char == "$":
                dollar = re.match(r"\$[\w]*\$", source[i:])
                if dollar:
                    quote = dollar.group()
                    i += len(quote)
                    continue
            elif char == ";":
                yield source[start:i + 1]
                start = i + 1
        elif quote == "$$" or (isinstance(quote, str) and quote.startswith("$")):
            if source.startswith(quote, i):
                i += len(quote)
                quote = None
                continue
        elif char == quote:
            if i + 1 < len(source) and source[i + 1] == quote:
                i += 2
                continue
            quote = None
        i += 1


def without_comments(stmt: str):
    return re.sub(r"(?m)^\s*--[^\n]*$", "", stmt).strip()


def extract_check_expr(stmt: str, opening: int):
    depth = 1
    i = opening + 1
    quoted = False
    while i < len(stmt):
        if stmt[i] == "'":
            if quoted and stmt[i:i+2] == "''":
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            if stmt[i] == "(":
                depth += 1
            if stmt[i] == ")":
                depth -= 1
                if depth == 0:
                    return stmt[opening + 1:i]
        i += 1
    raise RuntimeError("Unbalanced CHECK constraint: " + stmt[:160])


constraints = {}
functions = {}
triggers = {}
indexes = {}
index_tables = {}
extensions = {}
sources = {}
for item in sorted(migrations.iterdir()):
    sql = item / "migration.sql"
    if not sql.is_file():
        continue
    for raw in statements(sql.read_text()):
        stmt = without_comments(raw)
        if not stmt:
            continue
        kind = re.match(r'(?is)^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"?([\w]+)"?', stmt)
        if kind:
            functions[kind.group(1)] = stmt
            sources[kind.group(1)] = item.name
            continue
        kind = re.match(r'(?is)^CREATE\s+TRIGGER\s+"?([\w]+)"?', stmt)
        if kind:
            triggers[kind.group(1)] = stmt
            continue
        kind = re.match(r'(?is)^CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w-]+)"?', stmt)
        if kind:
            extensions[kind.group(1)] = stmt
            continue
        # Historical migrations can drop a table after creating a partial index.
        # A fresh db push already reflects the final Prisma schema, so these
        # obsolete indexes must not be replayed onto tables that no longer exist.
        dropped_table = re.match(
            r'(?is)^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"([^"]+)"', stmt
        )
        if dropped_table:
            table = dropped_table.group(1)
            constraints = {key: value for key, value in constraints.items() if key[0] != table}
            for name, indexed_table in list(index_tables.items()):
                if indexed_table == table:
                    indexes.pop(name, None)
                    index_tables.pop(name)
            continue
        dropped_index = re.match(
            r'(?is)^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"([^"]+)"', stmt
        )
        if dropped_index:
            indexes.pop(dropped_index.group(1), None)
            index_tables.pop(dropped_index.group(1), None)
            continue
        kind = re.match(
            r'(?is)^CREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"\s+ON\s+(?:ONLY\s+)?(?:"?public"?\.)?"([^"]+)"',
            stmt,
        )
        if kind and re.search(r"(?is)\bWHERE\b", stmt):
            indexes[kind.group(1)] = stmt
            index_tables[kind.group(1)] = kind.group(2)
            continue
        tbl = re.match(r'(?is)^(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?"([^"]+)"', stmt)
        if not tbl:
            continue
        table = tbl.group(1)
        drops = re.findall(r'(?is)\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"([^"]+)"', stmt)
        for name in drops:
            constraints.pop((table,name), None)
        for match in re.finditer(r'(?is)\bCONSTRAINT\s+"([^"]+)"\s+CHECK\s*\(', stmt):
            expr = extract_check_expr(stmt, match.end() - 1)
            constraints[(table,match.group(1))] = f'ALTER TABLE "{table}" ADD CONSTRAINT "{match.group(1)}" CHECK ({expr});'

output = [
    "-- GENERATED by generate-fresh-db-extras.py. DO NOT EDIT BY HAND.",
    "-- Migration-only DB objects omitted by Prisma db push.",
    "-- Apply to an EMPTY freshly pushed database BEFORE resolving historical migrations.",
    f"-- Objects: {len(extensions)} extensions, {len(constraints)} checks, {len(indexes)} partial indexes, {len(functions)} functions, {len(triggers)} triggers.",
    "",
]
for section, store in [
    ("extensions",extensions), ("CHECK constraints",constraints),
    ("partial indexes",indexes), ("functions",functions), ("triggers",triggers),
]:
    output += [f"-- {section}"]
    for key, value in store.items():
        output.append(value.strip())
        output.append("")
rendered = "\n".join(output).rstrip() + "\n"

arg = argparse.ArgumentParser()
arg.add_argument("--check", action="store_true")
args = arg.parse_args()
if args.check:
    if not target.exists() or target.read_text() != rendered:
        print(f"Fresh DB extra schema out of date: {target}", file=sys.stderr)
        sys.exit(1)
else:
    target.write_text(rendered)
print(f"Fresh baseline SQL objects: {len(constraints)} checks, {len(triggers)} triggers, {len(indexes)} partial indexes")
