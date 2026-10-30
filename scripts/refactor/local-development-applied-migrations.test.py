#!/usr/bin/env python3
"""Synthetic-only tests for restricted, in-memory Prisma migration ledger extraction."""
from __future__ import annotations

import runpy
import unittest
from pathlib import Path

source = runpy.run_path(str(Path(__file__).with_name('local-development-applied-migrations.py')))
parse = source['parse_exact_ledger_copy']

COLS = ('id', 'checksum', 'finished_at', 'migration_name', 'logs',
        'rolled_back_at', 'started_at', 'applied_steps_count')


def sample(*, name='20261015170000_mail_attempt_correlation',
           checksum='a'*64, logs='NEVER_EXPOSE_THIS_PRIVATE_LOG',
           finished='2026-10-17 15:38:15.804352+00', rolled=r'\N',
           started='2026-10-17 15:38:15.781618+00'):
    data = ('synthetic-row-1', checksum, finished, name, logs,
            rolled, started, '1')
    return ('-- scoped synthetic fixture only\n'
            'COPY public._prisma_migrations (' + ', '.join(COLS) + ') FROM stdin;\n' +
            '\t'.join(data) + '\n\\.\n')


class LedgerIsolationTests(unittest.TestCase):
    def assert_denied(self, blob):
        with self.assertRaisesRegex(RuntimeError, '^INFRA032_LEDGER_') as error:
            parse(blob)
        self.assertNotIn('NEVER_EXPOSE', str(error.exception))

    def test_only_six_allowlisted_fields_opaque_logs_not_retained(self):
        entry = parse(sample(logs='NEVER_EXPOSE_THIS_PRIVATE_LOG\\nNEXT_ROW_FAKE'))[0]
        self.assertEqual(set(entry), set(source['ALLOWED']))
        self.assertNotIn('NEVER_EXPOSE', repr(entry))
        self.assertNotIn('synthetic-row-1', repr(entry))
        self.assertEqual(entry['migration_name'], '20261015170000_mail_attempt_correlation')
        self.assertEqual(entry['checksum'], 'a'*64)

    def test_postgres_short_utc_timezone_and_microseconds(self):
        row = parse(sample(started='2026-10-17 15:38:15.78162+00'))[0]
        self.assertEqual(row['started_at'], '2026-10-17 15:38:15.78162+00')

    def test_other_table_copy_rejected_even_if_ledger_present(self):
        self.assert_denied(sample() + 'COPY public."User" (email) FROM stdin;\nprivate\n\\.\n')

    def test_no_ledger_copy_rejected(self):
        self.assert_denied('COPY public."User" (email) FROM stdin;\nprivate\n\\.\n')

    def test_bad_or_duplicate_columns_rejected(self):
        self.assert_denied(sample().replace('logs, ', 'logs, password, '))

    def test_unclosed_copy_rejected(self):
        self.assert_denied(sample().replace('\\.\n', ''))

    def test_bad_checksum_type_refuses_non_string_like_long_token(self):
        self.assert_denied(sample(checksum='x'*257))

    def test_noncanonical_checksum_never_called_sha256_match(self):
        row = parse(sample(checksum='manually-resolved'))[0]
        self.assertFalse(source['HEX'].fullmatch(row['checksum']))

    def test_rolled_back_attempt_keeps_allowed_timestamps(self):
        row = parse(sample(finished=r'\N', rolled='2026-10-18 09:00:00+00'))[0]
        self.assertIsNone(row['finished_at'])
        self.assertEqual(row['rolled_back_at'], '2026-10-18 09:00:00+00')

    def test_invalid_migration_name_refuses_control_characters(self):
        self.assert_denied(sample(name='20261001_unsafe\\nINSERT'))


if __name__ == '__main__':
    unittest.main()
