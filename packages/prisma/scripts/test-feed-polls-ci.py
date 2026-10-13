#!/usr/bin/env python3
"""Verify Feed poll migration against synthetic legacy data in a disposable local PG DB.

Requires POLL_TEST_DATABASE_URL pointing to a NEW local gafus_poll_ci_* database.
Never reads DATABASE_URL, reuses an existing database, or touches production.
"""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[3]
PRISMA = ROOT / 'packages/prisma'
SCHEMA = PRISMA / 'schema.prisma'
MIGRATION = PRISMA / 'migrations/20261014000000_feed_polls/migration.sql'
FIXTURES = PRISMA / 'tests/feed-polls-existing-data.sql'
TESTS = PRISMA / 'tests/feed-polls-migration.sql'
MODELS = ('FeedPoll', 'FeedPollOption', 'FeedPollVote', 'FeedPollVoteSelection')
COUNTS = {'User': 120, 'FeedPost': 600, 'FeedPostRevision': 600,
          'FeedMediaAsset': 300, 'FeedRevisionAttachment': 300,
          'FeedComment': 200, 'FeedPostReaction': 200}


def run(args, *, env, timeout=90, stdin=None):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True,
                            input=stdin, capture_output=True, timeout=timeout)
    if result.returncode:
        print(f'Command failed (exit {result.returncode}): {args[0]}', file=sys.stderr)
        print((result.stderr or result.stdout)[-2400:], file=sys.stderr)
        raise RuntimeError('Isolated Feed poll migration verification failed')
    return result.stdout


def base_schema(current):
    """Derive the previous datamodel *only* by removing this feature's known additions."""
    for field in ('  feedPollVotes FeedPollVote[]\n',
                  '  poll FeedPoll?\n',
                  '  pollOptions FeedPollOption[]\n'):
        if current.count(field) != 1:
            raise RuntimeError(f'Cannot derive pre-poll schema: unexpected {field.strip()}')
        current = current.replace(field, '', 1)
    for model in MODELS:
        current, count = re.subn(
            r'^model ' + model + r' \{\n.*?^\}\n\n', '', current,
            count=1, flags=re.MULTILINE | re.DOTALL)
        if count != 1:
            raise RuntimeError(f'Cannot derive pre-poll schema: missing {model}')
    return current


def existing_checksums(env):
    queries = []
    for table in COUNTS:
        key = '"revisionId"' if table == 'FeedRevisionAttachment' else 'id'
        prefix = ('stage3_revision_' if table == 'FeedRevisionAttachment'
                  else 'stage3_' + {'FeedPost': 'post', 'FeedPostRevision': 'revision',
                                     'FeedMediaAsset': 'media', 'FeedComment': 'comment',
                                     'FeedPostReaction': 'reaction', 'User': 'user'}[table] + '_')
        queries.append(
            f"SELECT '{table}', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '|' "
            f"ORDER BY {key}), '')) FROM \"{table}\" t WHERE {key} LIKE '{prefix}%'"
        )
    text = run(['psql', '-w', '-X', '-At', '-v', 'ON_ERROR_STOP=1',
                '-c', ' UNION ALL '.join(queries)], env=env)
    rows = {}
    for row in text.strip().splitlines():
        table, count, digest = row.split('|')
        rows[table] = (int(count), digest)
    for table, expected in COUNTS.items():
        if table not in rows or rows[table][0] != expected:
            raise RuntimeError(f'Unexpected fixture population: {table}: {rows.get(table)}')
    return rows


def main():
    url = os.environ.get('POLL_TEST_DATABASE_URL', '')
    parts = urlsplit(url)
    name = parts.path.lstrip('/')
    if (parts.scheme not in ('postgres', 'postgresql')
            or parts.hostname not in ('localhost', '127.0.0.1', '::1')
            or parts.port not in (None, 5432)
            or not parts.username or parts.query or parts.fragment
            or not re.fullmatch(r'gafus_poll_ci_[a-z0-9_]+', name)):
        raise RuntimeError('POLL_TEST_DATABASE_URL must be a local disposable gafus_poll_ci_* database')
    if not all(path.is_file() and not path.is_symlink() for path in (SCHEMA, MIGRATION, FIXTURES, TESTS)):
        raise RuntimeError('Required versioned poll schema/migration/test file missing')
    if not (ROOT / '.git').is_dir():
        raise RuntimeError('Expected the GAFUS repository root')

    pg_env = {**os.environ, 'PGHOST': parts.hostname, 'PGPORT': str(parts.port or 5432),
              'PGUSER': unquote(parts.username), 'PGPASSWORD': unquote(parts.password or ''),
              'PGCONNECT_TIMEOUT': '5', 'PGDATABASE': 'postgres'}
    app_env = {**pg_env, 'PGDATABASE': name, 'DATABASE_URL': url}
    psql_admin = ['psql', '-w', '-X', '-At', '-v', 'ON_ERROR_STOP=1']
    # No user-controlled SQL: the name was matched to a strict allowlist above.
    present = run(psql_admin + ['-c', f"SELECT count(*) FROM pg_database WHERE datname = '{name}'"],
                  env=pg_env).strip()
    if present != '0':
        raise RuntimeError('Refusing to reuse or overwrite an existing database')
    created = False
    try:
        run(psql_admin + ['-c', f'CREATE DATABASE "{name}"'], env=pg_env)
        created = True
        print(f'Created isolated PostgreSQL database {name}', flush=True)
        with tempfile.TemporaryDirectory(prefix='.feed-polls-ci-', dir=PRISMA) as tmp:
            baseline = Path(tmp) / 'schema.prisma'
            baseline.write_text(base_schema(SCHEMA.read_text()))
            run([str(ROOT / 'node_modules/.bin/prisma'), 'validate', '--schema', str(baseline)], env=app_env)
            run([str(ROOT / 'node_modules/.bin/prisma'), 'db', 'push',
                 '--schema', str(baseline), '--skip-generate'], env=app_env)
        print('Pre-poll datamodel installed', flush=True)

        run(['psql', '-w', '-X', '-v', 'ON_ERROR_STOP=1', '-f', str(FIXTURES)], env=app_env)
        before = existing_checksums(app_env)
        print('Legacy fixtures: 120 users, 600 posts, 600 revisions, 300 assets, '
              '300 attachments, 200 comments and 200 reactions', flush=True)

        run(['psql', '-w', '-X', '-v', 'ON_ERROR_STOP=1', '-f', str(MIGRATION)], env=app_env)
        after = existing_checksums(app_env)
        if before != after:
            raise RuntimeError('Migration changed existing rows or their content')
        print('Migration applied: all legacy rows and checksums preserved', flush=True)

        run([str(ROOT / 'node_modules/.bin/prisma'), 'migrate', 'diff',
             '--from-url', url, '--to-schema-datamodel', str(SCHEMA), '--exit-code'], env=app_env)
        print('Prisma datamodel matches migrated PostgreSQL', flush=True)

        output = run(['psql', '-w', '-X', '-v', 'ON_ERROR_STOP=1', '-f', str(TESTS)], env=app_env)
        if 'PASS: uniqueness' not in output or 'ROLLBACK' not in output:
            raise RuntimeError('SQL regression tests produced no PASS marker or rollback')
        print('Poll vote, image and cascade SQL tests passed', flush=True)

        integration_env = {**app_env, 'FEED_POLL_TEST_DATABASE_URL': url}
        run(['pnpm', '--filter', '@gafus/core', 'exec', 'vitest', 'run',
             '--config', 'vitest.config.ts',
             'src/services/feed/polls.integration.test.ts'], env=integration_env)
        print('Feed poll Core integration tests passed', flush=True)

        remaining = run(['psql', '-w', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
                         'SELECT count(*) FROM "FeedPoll"'], env=app_env).strip()
        if remaining != '0' or existing_checksums(app_env) != before:
            raise RuntimeError('SQL tests left behind new rows or changed fixtures')
        print('PASS: isolated poll migration CI checks', flush=True)
    finally:
        if created:
            run(psql_admin + ['-c', f'DROP DATABASE "{name}"'], env=pg_env)
            print('Removed only the disposable CI database', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(f'Feed poll migration verification failed: {error}', file=sys.stderr)
        sys.exit(1)
