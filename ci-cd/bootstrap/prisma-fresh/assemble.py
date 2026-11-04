#!/usr/bin/env python3
"""Build/review a candidate for *fresh, empty* PostgreSQL only.

No database connections or migrations are executed. --write edits only generated
candidate files in this directory; --verify is read-only and fails closed.
Do NOT call migrate resolve, alter applied migration SQL or use this for production.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from sql_inventory import ROOT, BASELINE, balanced_parens, inventory, split_sql, strip_leading_comments

DIRECTORY = Path(__file__).resolve().parent
SCHEMA = DIRECTORY / 'schema-v1.prisma'  # Immutable baseline schema, future datamodel may evolve
SNAPSHOT = DIRECTORY / 'inventory.review.json'
EXTRAS = DIRECTORY / '010-live-historical-invariants.candidate.sql'
SEEDS = DIRECTORY / '020-synthetic-singletons.candidate.sql'
COMBINED = DIRECTORY / 'fresh-only-bootstrap.candidate.sql'
EXPECTED_COUNTS = {'functions': 9, 'triggers': 12, 'extensions': 1,
                   'checks': 63, 'partialIndexes': 7, 'indexes': 471}
STATIC_SEED_SOURCE_TABLES = {'AccountDeletionCounter', 'AppSubscriptionSettings',
                             'RewardedAdSettings', 'MobileAppReleasePolicy',
                             'CourseContentRevision', 'AppFeatureFlag'}
DATA_BACKFILL_ONLY = {'TrainerNoteStudent', 'TrainerNoteEntry',
                      'AppSubscriptionTrial', 'RewardedTargetAccess'}
RETIRED_PARTIAL_INDEX = {'Payment_userId_courseId_pending_key'}  # Payment table absent in current datamodel.
RETIRED_SAME_TABLE_OLD_COLUMNS = {
    'DiaryEntry_userId_dayOnCourseId_key', 'DiaryEntry_dayOnCourseId_idx',
    'Course_appleIapProductId_key',
}  # Current DiaryEntry.dayId, Course no longer has appleIapProductId.
EXPECTED_INDEX_MISSING_FROM_BASELINE = 34
EXPECTED_ACTIVE_TABLE_INDEX_MISSING_FROM_BASELINE = 12
EXPECTED_LIVE_EXTRA_INDEXES = 9  # 6 partial, 3 ordinary.


def digest(value: str) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def stablejson(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n'


def require(condition: bool, message: str) -> None:
    if not condition: raise RuntimeError('BOOTSTRAP_REVIEW_REQUIRED: ' + message)


def table_columns(base: str) -> dict[str, set[str]]:
    """Extract current generated Prisma CREATE TABLE fields, not historical old columns."""
    result: dict[str, set[str]] = {}
    for statement in split_sql(base):
        core = strip_leading_comments(statement)
        m = re.match(r'^CREATE\s+TABLE\s+"([A-Za-z_][\w]*)"\s*\(', core, re.I)
        if not m: continue
        # A field line begins with a quoted identifier. Enum-typed columns are
        # followed by a quoted type, so a trailing regex word-boundary is wrong.
        # Constraints begin with the unquoted keyword CONSTRAINT and are excluded.
        fields = set(re.findall(r'(?m)^\s+"([^"\n]+)"[ \t]+', core))
        result[m.group(1)] = fields
    return result


def validate_inventory(data: dict, base: str) -> None:
    for name, number in EXPECTED_COUNTS.items():
        require(len(data[name]) == number,
                f'{name}: observed {len(data[name])}, reviewed {number}')
    require(set(data['seedSql']) == STATIC_SEED_SOURCE_TABLES | DATA_BACKFILL_ONLY,
            'seed sources changed; classify all before generating')
    require(set(data['extensions']) == {'uuid-ossp'}, 'extension change')
    require(set(data['partialIndexes']) & RETIRED_PARTIAL_INDEX == RETIRED_PARTIAL_INDEX,
            'retired Payment index needs historical confirmation')
    require(data['migrationCount'] == 163, 'history count changed')
    require(len(data['inlineChecks']) == 1 and
            data['inlineChecks'][0]['table'] == 'AccountStorageCleanup',
            'anonymous CHECK needs explicit review')
    require(not data['otherSpecial'], 'unreviewed CREATE/DROP type of custom SQL')
    cols = table_columns(base)
    require(len(cols) == 186, f'current schema table count changed: {len(cols)}')
    for namespace in ('checks','partialIndexes'):
        for name, item in data[namespace].items():
            if namespace == 'partialIndexes' and name in RETIRED_PARTIAL_INDEX: continue
            require(item['table'] in cols, f'{namespace}:{name} references retired {item["table"]}')
            # Verify all explicitly quoted column references in the CURRENT
            # datamodel; enum casts of the form ::"EnumType" are not columns.
            text = item['expression'] if namespace == 'checks' else item['sql'].split(' ON ', 1)[-1]
            if namespace == 'partialIndexes':
                # Strip the index's own name/table prefix and any escaped string
                # contents; quoted identifiers after ON are table columns.
                text = item['sql'].split('(', 1)[-1]
            tokens = set(re.findall(r'"([^"\n]+)"', text))
            tokens = {t for t in tokens if not re.search(r'::\s*"' + re.escape(t) + r'"', text)}
            require(not (tokens - cols[item['table']]),
                    f'{namespace}:{name} contains unknown columns {sorted(tokens-cols[item["table"]])}')
    require('Payment' not in cols, 'Payment returned; retired partial index needs review')
    # All historical indexes that retain the *same* name in the current Prisma
    # output must retain the identical table/column signature, not silently
    # lose or change uniqueness/ordering through schema drift.
    index_pattern = re.compile(r'^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][\w]*)"?\s+ON\s+(?:public\.)?"?([A-Za-z_][\w]*)"?\s*\((.*)\)(?:\s+WHERE\s+.*)?\s*;', re.I|re.S)
    base_signatures = {}
    for stmt in split_sql(base):
        match = index_pattern.match(strip_leading_comments(stmt))
        if match: base_signatures[match.group(1)] = (
            match.group(2),re.sub(r'\s+','',match.group(3)).lower())
    overlaps = set(data['indexes']) & set(base_signatures)
    require(len(overlaps)==437, f'historical/current index overlap changed: {len(overlaps)}')
    for name in overlaps:
        entry = index_pattern.match(data['indexes'][name]['sql'])
        require(entry is not None, f'unparseable historical index: {name}')
        historical = (entry.group(2),re.sub(r'\s+','',entry.group(3)).lower())
        require(base_signatures[name] == historical,
                f'existing Prisma index definition differs from historical one: {name}')
    existing_indexes = set(re.findall(r'\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"', base, re.I))
    missing_names = set(data['indexes']) - existing_indexes
    missing_live = {k for k in missing_names if data['indexes'][k]['table'] in cols}
    require(len(missing_names) == EXPECTED_INDEX_MISSING_FROM_BASELINE,
            f'unreviewed historical-only indexes: {len(missing_names)}')
    require(len(missing_live) == EXPECTED_ACTIVE_TABLE_INDEX_MISSING_FROM_BASELINE,
            f'unreviewed currently extant table index differences: {len(missing_live)}')
    require(RETIRED_SAME_TABLE_OLD_COLUMNS <= missing_live,
            'stale indexes referencing retired columns need review')
    valid = missing_live - RETIRED_SAME_TABLE_OLD_COLUMNS
    require(len(valid) == EXPECTED_LIVE_EXTRA_INDEXES and
            valid & set(data['partialIndexes']) == set(data['partialIndexes']) - RETIRED_PARTIAL_INDEX,
            f'historical-only live indexes not reviewed: {sorted(valid)}')
    for name in valid:
        item = data['indexes'][name]
        # Index prefixes can include quoted table names, but after the first
        # '(' the only quoted identifiers are existing table columns.
        index_text = item['sql'].split('(', 1)[-1]
        referenced = set(re.findall(r'"([^"\n]+)"', index_text))
        require(referenced <= cols[item['table']],
                f'index {name} references retired columns {referenced-cols[item["table"]]}')
    # Latest overwritten rules, not the superseded original definitions.
    require('BETWEEN 0 AND 100' in data['checks']['RewardedAdSettings_daily_limit_allowed']['expression'],
            'rewarded ads latest limit lost')
    require('THREE_MONTHS' in data['checks']['AppSubscriptionPayment_promo_scope_check']['expression'],
            'promo checkout latest scope lost')
    require('ARTICLE' in data['checks']['GafusTargetAccess_target_shape']['expression'],
            'article target access latest shape lost')
    require('30' in data['checks']['NpdReceipt_plan_interval_check']['expression'],
            'NPD later interval policy lost')
    require('AppSubscriptionPromoCode' in cols and 'AppSubscriptionPayment' in cols,
            'payment guard targets missing')
    require('Chat2Media' in cols and 'Chat2MediaDeletionIntent' in cols,
            'deletion-ledger targets missing')
    # Current-schema only: ALL synthetic seed columns checked against live baseline DDL.
    for table, required in {
        'AppSubscriptionSettings': {'key','updatedAt'},
        'RewardedAdSettings': {'key','androidEnabled','iosEnabled','dailyAdLimit','testMode','updatedAt'},
        'MobileAppReleasePolicy': {'key','revision','createdAt','updatedAt'},
        'AppFeatureFlag': {'key','enabled','reviewEnabled','updatedAt'},
        'AccountDeletionCounter': {'id','totalDeleted','createdAt','updatedAt'},
        'CourseContentRevision': {'id','revision'},
    }.items():
        require(required <= cols[table], f'seed {table} columns changed: {required - cols[table]}')
    # Historical migrations updated default tariffs several times. Exact final
    # value is fixed here and must be re-reviewed if current schema changes.
    for fragment in ['"yookassaWeeklyPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 200.00',
                     '"yookassaMonthlyPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 1465.00',
                     '"yookassaTwoWeeksPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 1185.00',
                     '"yookassaThreeMonthsPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 2470.00',
                     '"twoWeeksIntervalDays" INTEGER NOT NULL DEFAULT 30',
                     '"threeMonthsIntervalDays" INTEGER NOT NULL DEFAULT 30',
                     '"monthlyEnabled" BOOLEAN NOT NULL DEFAULT true']:
        require(fragment in base, f'AppSubscriptionSettings final tariff drift: {fragment}')
    require('"webDesktopEnabled"' not in cols['RewardedAdSettings'] and
            '"webTouchEnabled"' not in cols['RewardedAdSettings'],
            'legacy RewardedAdSettings columns changed; seed must be reviewed')
    new_scopes = data['doBlocks'][-1]['sql']
    require(data['doBlocks'][-1]['migration'] == '20261025155900_account_cleanup_add_private_scopes' and
            all(token in new_scopes for token in ("''questions''","''documents''")),
            'latest dynamic AccountStorageCleanup scope CHECK requires review')


def historical_extras(data: dict, base: str) -> str:
    cols = table_columns(base)
    parts = ['-- GAFUS REVIEW-ONLY BOOTSTRAP: fresh, empty DB, NOT production migrations.\n'
             '-- Historical SQL has been transplanted from unmodified migration files.\n'
             '-- Apply ONLY after 000-current-prisma-schema.candidate.sql.\n']
    # Extensions must come before SQL functions. The historic uuid-ossp backfill
    # is inapplicable on a fresh DB, but extension is preserved for parity.
    for name, item in sorted(data['extensions'].items()):
        parts.append(f'\n-- source: {item["migration"]} (extension {name})\n{item["sql"]}\n')
    # CHECK constraints previously embedded in historical CREATE TABLE/ALTER TABLE
    # are missing from Prisma Migrate diff. Re-add final *active* expressions.
    for name, item in sorted(data['checks'].items()):
        require(item['table'] in cols, f'CHECK {name} table not in schema')
        expression = item['expression'].rstrip(';')
        parts.append(f'\n-- source: {item["migration"]} (CHECK {name})\n'
                     f'ALTER TABLE "{item["table"]}" ADD CONSTRAINT "{name}" CHECK {expression};\n')
    # Historical AccountStorageCleanup was created with TWO inline column CHECKs;
    # the scope constraint was later changed inside an audited DO $guard$ block.
    # Do not execute the old migration: its guarded command is for OLD schemas.
    parts.append('''
-- source: 20261010160000_account_storage_cleanup + 20261025155900_account_cleanup_add_private_scopes
-- Explicitly named equivalent of the latest active legacy inline constraints.
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_status_check"
  CHECK ("status" IN ('pending','processing','done'));
ALTER TABLE "AccountStorageCleanup" ADD CONSTRAINT "AccountStorageCleanup_scope_check"
  CHECK ("scope" IN ('public','gallery','feed','stream','questions','documents'));
''')
    # A retired Payment model is intentionally excluded; all other currently
    # active raw partial indexes MUST be present, including concurrency guards.
    existing_indexes = set(re.findall(r'\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"', base, re.I))
    live_extra = {k for k in data['indexes'] if k not in existing_indexes
                  and data['indexes'][k]['table'] in cols
                  and k not in RETIRED_SAME_TABLE_OLD_COLUMNS}
    for name in sorted(live_extra):
        item = data['indexes'][name]
        kind = 'partial' if name in data['partialIndexes'] else 'ordinary'
        parts.append(f'\n-- source: {item["migration"]} ({kind} index {name})\n{item["sql"]}\n')
    # Functions may call each other, so preserve migration/statement order.
    for name, item in sorted(data['functions'].items(), key=lambda pair:(pair[1]['migration'],pair[1]['ordinal'])):
        parts.append(f'\n-- source: {item["migration"]} (FUNCTION {name})\n{item["sql"]}\n')
    for name, item in sorted(data['triggers'].items(),key=lambda pair:(pair[1]['migration'],pair[1]['ordinal'])):
        parts.append(f'\n-- source: {item["migration"]} (TRIGGER {name})\n{item["sql"]}\n')
    return ''.join(parts).strip()+'\n'


def synthetic_seeds(data: dict) -> str:
    # Every INSERT is on intentionally empty bootstrap tables and uses only
    # constants; NEVER SELECT personal/backfill rows from old product tables.
    seeds = '''-- GAFUS ONLY-NEW-EMPTY-DB bootstrap seeds, no user records, no legacy backfills.
-- sources: 20260424143000, 20260510235500, 20260531140000,
--          20260726120000, 20261015020000 + final 20261004120000 tariff defaults.
-- AppSubscriptionSettings 20260510235500 original seed referenced retired
-- intervalDays; the current schema has weeklyIntervalDays/monthlyIntervalDays.
-- Current 200/1465/1185/2470 RUB and 7/30/30/30 days are DB defaults,
-- verified against schema output by assemble.py.
INSERT INTO "AppSubscriptionSettings" ("key", "updatedAt")
  VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

-- Old web reward flags no longer exist in the latest RewardedAdSettings.
INSERT INTO "RewardedAdSettings"
  ("key", "androidEnabled", "iosEnabled", "dailyAdLimit", "testMode", "updatedAt")
  VALUES ('default', false, false, 1, true, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AccountDeletionCounter" ("id", "totalDeleted", "createdAt", "updatedAt")
  VALUES ('global', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CourseContentRevision" ("id", "revision")
  VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MobileAppReleasePolicy"
  ("key", "iosReviewVersion", "revision", "createdAt", "updatedAt")
  VALUES ('default', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

-- Historical 20260726120000 selects the current RewardedAdSettings iosEnabled
-- (false on fresh DB), and sets reviewEnabled false. Never open review mode.
INSERT INTO "AppFeatureFlag" ("key", "enabled", "reviewEnabled", "updatedAt")
  VALUES ('mobile_rewarded_ads_ios', false, false, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;
'''
    require(len(re.findall(r'\bINSERT\s+INTO\b',seeds,re.I))==6, 'unexpected static seed count')
    return seeds


def snapshot(data: dict, base: str, extras: str, seeds: str) -> dict:
    return {'purpose':'REVIEW_ONLY_FRESH_EMPTY_POSTGRES_NEVER_EXISTING_DB',
      'schemaPrismaSha256': hashlib.sha256(SCHEMA.read_bytes()).hexdigest(),
      'schemaCandidateSha256': digest(base),
      'extrasCandidateSha256': digest(extras), 'syntheticSeedsSha256': digest(seeds),
      'combinedSha256': digest(base.rstrip()+'\n\n'+extras+'\n'+seeds),
      'migrationCount':data['migrationCount'], 'migrationsSha256':data['migrations'],
      'objects':{key:{name:{'source':item['migration'],'statementSha256':item['sha256'],
                              **({'table':item['table']} if 'table' in item else {})}
                       for name,item in sorted(data[key].items())}
                 for key in EXPECTED_COUNTS},
      'anonymousCheckOverrides':['AccountStorageCleanup_status_check','AccountStorageCleanup_scope_check'],
      'historicalActiveIndexes':len(data['indexes']),
      'historicalOnlyIndexes': EXPECTED_INDEX_MISSING_FROM_BASELINE,
      'liveExtraIndexes':EXPECTED_LIVE_EXTRA_INDEXES,
      'retiredOrRenamedSameTableIndexesExcluded':sorted(RETIRED_SAME_TABLE_OLD_COLUMNS),
      'retiredPartialIndexExcluded':sorted(RETIRED_PARTIAL_INDEX),
      'singletonSeedTables':sorted(STATIC_SEED_SOURCE_TABLES),
      'historicalBackfillTablesNotReplayed':sorted(DATA_BACKFILL_ONLY),
      'historicalDataStatementCount':len(data['dataOperations']),
      'historicalDataOperations':[{**operation,'disposition':(
        'static_singleton_rewritten_to_current_schema' if operation['kind']=='INSERT' and operation.get('table') in STATIC_SEED_SOURCE_TABLES
        else 'existing_user_rows_absent_fresh_db_skip' if operation['kind']=='INSERT'
        else 'current_schema_defaults_encapsulate_final_tariff_state' if operation['kind']=='UPDATE' and operation['migration'] in {
          '20260621120000_add_monthly_app_subscription_plan',
          '20260715110000_monthly_app_subscription_only',
          '20260813200000_add_yookassa_multiperiod_plans',
          '20261004120000_subscription_agreement_terms'}
        else 'legacy_existing_data_cleanup_skip_on_new_empty_db' if operation['kind']=='DELETE'
        else 'legacy_existing_data_backfill_skip_on_new_empty_db')}
        for operation in data['dataOperations']],
      'historicalDoBlockCount':len(data['doBlocks']),
      'historicalDoBlocks':[
          {'migration':entry['migration'],'ordinal':entry['ordinal'],'sha256':entry['sha256'],
           'disposition':(
             'latest_private_scope_check_materialized_as_sql' if entry['migration']=='20261025155900_account_cleanup_add_private_scopes'
             else 'enum_definitions_in_current_schema' if entry['migration'] in {
               '20260113163458_add_hls_fields_to_trainer_video',
               '20260128120000_add_payment_and_price','20260510235500_add_app_subscription'}
             else 'legacy_data_or_schema_guard_skip_current_fresh_schema')}
          for entry in data['doBlocks']],
      'liveMissingIndexDecisions':[
          {'name':name,'source':item['migration'],'table':item['table'],
           'disposition':('excluded_retired_table' if item['table'] not in table_columns(base)
             else 'excluded_renamed_column' if name in RETIRED_SAME_TABLE_OLD_COLUMNS
             else 'restored_from_historical_statement')}
          for name,item in sorted(data['indexes'].items())
          if name not in set(re.findall(r'\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+"([^"]+)"', base, re.I))],
      'notes':['No data backfill or old-user row migration on a fresh database.',
               'No applied migration journal is inserted. No migrate resolve.',
               'No check for production equivalence without independent full PG review.',
               'Original 163 migrations remain unchanged and are never replayed here.']}


def main() -> None:
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--write', action='store_true',help='materialize review-only SQL/JSON files (no DB)')
    cli.add_argument('--verify', action='store_true',help='read-only deterministic source/manifest parity check')
    args = cli.parse_args()
    require(args.write != args.verify,'specify exactly --write or --verify')
    data = inventory()
    base = BASELINE.read_text()
    validate_inventory(data, base)
    extras=historical_extras(data,base)
    seeds=synthetic_seeds(data)
    combined=base.rstrip()+'\n\n'+extras+'\n'+seeds
    manifest=stablejson(snapshot(data,base,extras,seeds))
    outputs = [(EXTRAS,extras),(SEEDS,seeds),(COMBINED,combined),(SNAPSHOT,manifest)]
    for path, content in outputs:
        if args.write: path.write_text(content,encoding='utf-8')
        else:
            require(path.exists(),f'candidate absent: {path.name}')
            require(path.read_text()==content, f'stale candidate: {path.name}')
    print(f'PASS bootstrap {"materialized" if args.write else "read-only parity"}: '
          f'{len(data["functions"])} funcs, {len(data["triggers"])} triggers, '
          f'{len(data["checks"])+2} CHECK, {EXPECTED_LIVE_EXTRA_INDEXES} live extra indexes (6 partial + 3 ordinary), '
          '1 extension, 6 static singleton inserts, '
          f'{len(data["dataOperations"])} audited history data statements')
    print('SAFE: no DB access, no applied migration history, no prod operation')

if __name__=='__main__':
    try: main()
    except (RuntimeError,ValueError) as e:
        print(str(e),file=sys.stderr);sys.exit(1)
