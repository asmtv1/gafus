#!/usr/bin/env python3
"""Deterministic, dependency-free read-only SQL history inventory for fresh PG bootstrap.

Intentionally no DATABASE_URL, no Prisma connect, no migrate resolve or SQL execution.
Splits semicolon-delimited migration SQL while respecting comments, quotes and
PostgreSQL $$ / $tag$ procedure bodies. Fails closed on unterminated source.
"""
from __future__ import annotations
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = ROOT / 'packages/prisma/migrations'
BASELINE = ROOT / 'ci-cd/bootstrap/prisma-fresh/000-current-prisma-schema.candidate.sql'
# Frozen migration cutoff for option A v1. Later migrations are ordinary forward SQL.
BASELINE_LAST = '20261103180000_step_multiple_video_urls'


def split_sql(sql: str) -> list[str]:
    statements = []
    i = start = 0
    state = 'normal'
    dollar = ''
    depth = 0
    while i < len(sql):
        c = sql[i]
        other = sql[i:i+2]
        if state == 'normal':
            if other == '--': state = 'line'; i += 2; continue
            if other == '/*': state = 'block'; depth = 1; i += 2; continue
            if c == "'": state = 'single'
            elif c == '"': state = 'double'
            elif c == '$':
                hit = re.match(r'\$[A-Za-z_0-9]*\$', sql[i:])
                if hit:
                    dollar = hit.group(0); state = 'dollar'; i += len(dollar); continue
            elif c == ';':
                statements.append(sql[start:i+1].strip()); start = i + 1
        elif state == 'line':
            if c == '\n': state = 'normal'
        elif state == 'block':
            if other == '/*': depth += 1; i += 2; continue
            if other == '*/':
                depth -= 1; i += 2
                if depth == 0: state = 'normal'
                continue
        elif state == 'single':
            if other == "''": i += 2; continue
            if c == "'": state = 'normal'
        elif state == 'double':
            if other == '""': i += 2; continue
            if c == '"': state = 'normal'
        elif state == 'dollar':
            if sql.startswith(dollar, i): state = 'normal'; i += len(dollar); continue
        i += 1
    if state not in ('normal', 'line'):
        raise ValueError(f'UNTERMINATED_SQL_{state}: {sql[-65:]}')
    if sql[start:].strip():
        tail = strip_leading_comments(sql[start:]).strip()
        if tail: raise ValueError(f'UNTERMINATED_SQL_STATEMENT: {tail[:105]}')
    return [x for x in statements if strip_leading_comments(x).strip()]


def strip_leading_comments(sql: str) -> str:
    sql = sql.lstrip()
    while True:
        if sql.startswith('--'):
            sql = sql.partition('\n')[2].lstrip(); continue
        if sql.startswith('/*'):
            pos = sql.find('*/')
            if pos < 0: raise ValueError('UNTERMINATED_LEADING_COMMENT')
            sql = sql[pos+2:].lstrip(); continue
        return sql


def balanced_parens(sql: str, opener: int) -> str:
    assert sql[opener] == '(', sql[opener:opener+15]
    depth = 0; quote = None; i = opener
    while i < len(sql):
        c = sql[i]
        if quote:
            if c == quote:
                if sql[i+1:i+2] == quote: i += 2; continue
                quote = None
        elif c in "'\"": quote = c
        elif c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: return sql[opener:i+1]
        i += 1
    raise ValueError('UNCLOSED_CHECK_PAREN')


def sql_checksum(data: str) -> str:
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def inventory() -> dict:
    files = sorted(p for p in MIGRATIONS.glob('*/migration.sql') if p.parent.name <= BASELINE_LAST)
    if len(files) != 163: raise ValueError(f'REVIEW_REQUIRED_MIGRATION_COUNT_{len(files)}_WAS_163')
    output = {'migrationCount': len(files), 'migrations': {}, 'functions': {},
              'triggers': {}, 'extensions': {}, 'checks': {}, 'indexes': {}, 'partialIndexes': {},
              'droppedConstraints': {}, 'droppedIndexes': {}, 'seedSql': {},
              'dataOperations': [], 'doBlocks': [], 'otherSpecial': [], 'inlineChecks': []}
    regex_func = re.compile(r'^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+("?[A-Za-z_][\w]*"?)\s*\(',re.I|re.S)
    regex_trig = re.compile(r'^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("?[A-Za-z_][\w]*"?)\b',re.I|re.S)
    regex_ext = re.compile(r'^CREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+("?[A-Za-z_][\w-]*"?)\b',re.I|re.S)
    regex_table = re.compile(r'^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?"?([A-Za-z_][\w]*)"?',re.I|re.S)
    regex_alter = re.compile(r'^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([A-Za-z_][\w]*)"?',re.I|re.S)
    regex_check = re.compile(r'\bCONSTRAINT\s+"?([A-Za-z_][\w]*)"?\s+CHECK\s*(\()',re.I|re.S)
    regex_drop = re.compile(r'\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][\w]*)"?',re.I|re.S)
    regex_index = re.compile(r'^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][\w]*)"?\s+ON\s+(?:public\.)?"?([A-Za-z_][\w]*)"?',re.I|re.S)
    regex_drop_index = re.compile(r'^DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][\w]*)"?',re.I|re.S)
    for file in files:
        name = file.parent.name; source = file.read_text()
        output['migrations'][name] = sql_checksum(source)
        for index, stmt in enumerate(split_sql(source)):
            core = strip_leading_comments(stmt).strip()
            entry = {'migration': name, 'ordinal': index, 'sha256': sql_checksum(core), 'sql': core}
            if m := regex_func.match(core):
                output['functions'][m.group(1).strip('"')] = entry; continue
            if m := regex_trig.match(core):
                output['triggers'][m.group(1).strip('"')] = entry; continue
            if m := regex_ext.match(core):
                output['extensions'][m.group(1).strip('"')] = entry; continue
            if m := regex_drop_index.match(core):
                output['droppedIndexes'][m.group(1).strip('"')] = entry
                output['partialIndexes'].pop(m.group(1).strip('"'), None)
                output['indexes'].pop(m.group(1).strip('"'), None)
                continue
            if m := regex_index.match(core):
                key = m.group(1).strip('"')
                output['indexes'][key] = {**entry,'table':m.group(2)}
                if re.search(r'\bWHERE\b',core,re.I):
                    output['partialIndexes'][key] = {**entry,'table':m.group(2)}
                else: output['partialIndexes'].pop(key,None)
                continue
            table = None
            if m := regex_table.match(core): table = m.group(1)
            if m := regex_alter.match(core): table = m.group(1)
            if table:
                for m in regex_drop.finditer(core):
                    key = m.group(1)
                    output['droppedConstraints'][key] = entry
                    output['checks'].pop(key, None)
                for m in regex_check.finditer(core):
                    key = m.group(1)
                    expr = balanced_parens(core,m.start(2))
                    output['checks'][key] = {**entry,'table':table,'expression':expr}
                    output['droppedConstraints'].pop(key, None)
                if re.search(r'(?<!\w)CHECK\s*\(',core,re.I) and not regex_check.search(core):
                    output['inlineChecks'].append({'table':table,**entry})
            if re.match(r'^INSERT\s+INTO\b',core,re.I):
                m = re.search(r'^INSERT\s+INTO\s+(?:public\.)?"?(\w+)"?',core,re.I)
                if m: output['seedSql'].setdefault(m.group(1),[]).append(entry)
                output['dataOperations'].append({'kind':'INSERT','migration':name,'ordinal':index,'table':m.group(1) if m else '?','sha256':entry['sha256']})
            if re.match(r'^(?:UPDATE|DELETE\s+FROM)\b',core,re.I):
                output['dataOperations'].append({'kind':'UPDATE' if core.upper().startswith('UPDATE') else 'DELETE',
                    'migration':name,'ordinal':index,'sha256':entry['sha256']})
            if re.match(r'^DO\s+\$',core,re.I):
                output['doBlocks'].append(entry)
            if re.match(r'^(?:CREATE\s+(?:UNIQUE\s+)?(?:VIEW|MATERIALIZED\s+VIEW|SEQUENCE|PROCEDURE|RULE|POLICY|PUBLICATION)|ALTER\s+(?:FUNCTION|TRIGGER|EXTENSION)|DROP\s+(?:FUNCTION|TRIGGER|EXTENSION))',core,re.I):
                output['otherSpecial'].append(entry)
    return output


if __name__ == '__main__':
    data = inventory()
    print('migrationCount',data['migrationCount'])
    for key in ('functions','triggers','extensions','checks','partialIndexes','seedSql'):
        print(key,len(data[key]),sorted(data[key]))
    for key in ('inlineChecks','doBlocks','otherSpecial'):
        print(key,len(data[key]),[(x.get('migration'),x.get('table')) for x in data[key][:10]])
    print('dataOperations',len(data['dataOperations']))
