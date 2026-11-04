"""Dependency-free, read-only contract suite for GAFUS fresh-only PG candidate.

NEVER connects to PostgreSQL, changes history, runs Prisma migrate resolve or
performs a deploy. The reviewed snapshot must move only by explicit --write.
"""
import copy
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

from assemble import (BASELINE, DIRECTORY, EXTRAS, SEEDS, COMBINED, SNAPSHOT,
                      RETIRED_PARTIAL_INDEX, EXPECTED_COUNTS, table_columns,
                      validate_inventory, snapshot, digest)
from sql_inventory import inventory, split_sql, strip_leading_comments


class SqlSplitterContract(unittest.TestCase):
    def test_proc_dollar_quote_preserves_semicolons(self):
        source = '''-- preliminary semicolon ;\nCREATE FUNCTION "example"() RETURNS void AS $tag$
        BEGIN PERFORM 1; PERFORM 2; END; $tag$ LANGUAGE plpgsql;
        /* a; /* nested; */ block */ CREATE TRIGGER "test" BEFORE UPDATE ON "Course"
          FOR EACH ROW EXECUTE FUNCTION "gafus_course_increment_version"();'''
        statements=split_sql(source)
        self.assertEqual(len(statements),2)
        self.assertIn('PERFORM 1; PERFORM 2;',statements[0])
        self.assertIn('CREATE TRIGGER',statements[1])

    def test_strings_and_double_quoted_identifiers_do_not_split(self):
        sql="SELECT 'text; and '' escape ;' AS \"name;literal\"; SELECT 2;"
        self.assertEqual(len(split_sql(sql)),2)

    def test_unterminated_dollar_quote_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'UNTERMINATED_SQL_dollar'):
            split_sql('DO $guard$ BEGIN SELECT 1; END;')

    def test_unterminated_statement_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'UNTERMINATED_SQL_STATEMENT'):
            split_sql('CREATE INDEX "x" ON "User"("id")')


class FreshBootstrapContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inv=inventory()
        cls.base=BASELINE.read_text()
        cls.extra=EXTRAS.read_text()
        cls.seed=SEEDS.read_text()
        cls.all_sql=COMBINED.read_text()
        cls.manifest=json.loads(SNAPSHOT.read_text())
        cls.columns=table_columns(cls.base)

    def test_pinned_history_invariants_are_read_only(self):
        validate_inventory(self.inv,self.base)
        self.assertEqual(self.manifest['migrationCount'],163)
        self.assertEqual(self.manifest['migrationsSha256'],self.inv['migrations'])
        self.assertEqual(self.manifest['schemaCandidateSha256'],digest(self.base))
        self.assertEqual(self.manifest['extrasCandidateSha256'],digest(self.extra))
        self.assertEqual(self.manifest['syntheticSeedsSha256'],digest(self.seed))
        self.assertEqual(self.manifest['combinedSha256'],digest(self.all_sql))
        self.assertEqual(self.all_sql,self.base.rstrip()+'\n\n'+self.extra+'\n'+self.seed)
        self.assertEqual(set(EXPECTED_COUNTS),set(self.manifest['objects']))

    def test_all_nine_functions_twelve_triggers_and_extension(self):
        for kind in ('functions','triggers','extensions'):
            self.assertEqual(len(self.inv[kind]),EXPECTED_COUNTS[kind])
            for name,item in self.inv[kind].items():
                self.assertIn(item['sql'],self.extra,name)
                self.assertEqual(self.manifest['objects'][kind][name]['statementSha256'],item['sha256'])
        self.assertEqual(len(re.findall(r'^CREATE FUNCTION',self.extra,re.M)),9)
        self.assertEqual(len(re.findall(r'^CREATE TRIGGER',self.extra,re.M)),12)
        self.assertEqual(len(re.findall(r'^CREATE EXTENSION',self.extra,re.M)),1)
        self.assertIn('chat2_capture_media_deletion',self.extra)
        self.assertIn('gafus_course_increment_version',self.extra)
        self.assertIn('AppSubscriptionPayment_price_snapshot_guard',self.extra)

    def test_sixty_five_latest_check_constraints_with_valid_columns(self):
        self.assertEqual(len(self.inv['checks']),63)
        names=re.findall(r'ALTER TABLE "[^"]+" ADD CONSTRAINT "([^"]+)" CHECK',self.extra)
        # Two multiline manually-audited AccountStorageCleanup latest constraints.
        names.extend(re.findall(r'ADD CONSTRAINT "(AccountStorageCleanup_[^"]+)"',self.extra))
        self.assertEqual(len(names),65)
        self.assertEqual(len(set(names)),65)
        for name,check in self.inv['checks'].items():
            self.assertIn(name,names)
            self.assertIn(check['table'],self.columns)
            refs=set(re.findall(r'"([^"\n]+)"',check['expression']))
            refs={r for r in refs if not re.search(r'::\s*"'+re.escape(r)+'"',check['expression'])}
            self.assertFalse(refs-self.columns[check['table']],(name,refs-self.columns[check['table']]))
        self.assertIn('CHECK ("dailyAdLimit" BETWEEN 0 AND 100)',self.extra)
        self.assertIn("'ARTICLE'",self.inv['checks']['GafusTargetAccess_target_shape']['expression'])
        self.assertIn("'THREE_MONTHS'",self.inv['checks']['AppSubscriptionPayment_promo_scope_check']['expression'])
        self.assertIn("'questions','documents'",self.extra)
        self.assertNotIn('CHECK ("dailyAdLimit" IN (1, 2, 3))',self.extra)

    def test_six_live_partial_indexes_preserve_concurrency_guards(self):
        active=set(self.inv['partialIndexes'])-RETIRED_PARTIAL_INDEX
        self.assertEqual(len(active),6)
        all_extra_indices = re.findall(r'^CREATE (?:UNIQUE )?INDEX',self.extra,re.M)
        self.assertEqual(len(all_extra_indices),9)
        self.assertEqual(self.manifest['liveExtraIndexes'],9)
        for name in ['PetDocument_petId_ownerId_idx',
                     'AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx',
                     'AppSubscriptionPayment_subscriptionId_status_succeededAt_idx']:
            self.assertIn(self.inv['indexes'][name]['sql'],self.extra)
        for dead in ['DiaryEntry_userId_dayOnCourseId_key','DiaryEntry_dayOnCourseId_idx',
                     'Course_appleIapProductId_key']:
            self.assertNotIn(dead,self.extra)
        for name in active:self.assertIn(self.inv['partialIndexes'][name]['sql'],self.extra)
        for dead in RETIRED_PARTIAL_INDEX:
            self.assertNotIn(dead,self.extra)
        for required in ['ConsultationBooking_slotId_active_key',
                         'AppSubscription_userId_provider_active_unique',
                         'StepNotification_active_bound_unique',
                         'Chat2V2MediaTask_cleanup_pending_idx']:
            self.assertIn(required,active)

    def test_six_constant_only_singleton_seeds_and_no_user_backfill(self):
        statements=[strip_leading_comments(s) for s in split_sql(self.seed)]
        self.assertEqual(len(statements),6)
        self.assertTrue(all(re.match(r'^INSERT\s+INTO',s,re.I) for s in statements))
        for name in ['AccountDeletionCounter','AppSubscriptionSettings','RewardedAdSettings',
                     'CourseContentRevision','MobileAppReleasePolicy','AppFeatureFlag']:
            self.assertEqual(sum(bool(re.match(r'^INSERT\s+INTO\s+"'+name+'"',s,re.I)) for s in statements),1)
        self.assertNotIn('SELECT ',self.seed.upper())
        for missing in ['TrainerNoteStudent','TrainerNoteEntry','AppSubscriptionTrial','RewardedTargetAccess']:
            self.assertNotIn('INSERT INTO "'+missing+'"',self.seed)
        for k in ('AppSubscriptionSettings','RewardedAdSettings'):
            self.assertIn(k,self.manifest['singletonSeedTables'])
        self.assertNotIn('webDesktopEnabled',self.seed)
        self.assertIn('mobile_rewarded_ads_ios',self.seed)

    def test_extras_and_seeds_have_no_destructive_top_level_sql(self):
        extras=[strip_leading_comments(s) for s in split_sql(self.extra)]
        self.assertEqual(len(extras),96)
        self.assertEqual(len(split_sql(self.seed)),6)
        for statement in extras:
            self.assertRegex(statement,r'^(?:ALTER TABLE|CREATE FUNCTION|CREATE TRIGGER|CREATE EXTENSION|CREATE UNIQUE INDEX|CREATE INDEX)\b')
            self.assertNotRegex(statement,r'^(?:UPDATE|DELETE|DROP|TRUNCATE|DO|BEGIN|COMMIT|INSERT)\b')
        for statement in split_sql(self.all_sql):
            first=strip_leading_comments(statement)
            self.assertNotRegex(first,r'^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|DO|BEGIN|COMMIT)\b')
            self.assertNotIn('_prisma_migrations',first.lower())

    def test_fail_closed_for_unreviewed_new_historical_check(self):
        mutated=copy.deepcopy(self.inv)
        mutated['checks']['QA_unreviewed_check']={**next(iter(mutated['checks'].values())),
              'table':'Course','expression':'("version" > 0)'}
        with self.assertRaisesRegex(RuntimeError,'checks'):
            validate_inventory(mutated,self.base)

    def test_every_historical_dml_and_do_block_classified_without_replay(self):
        self.assertEqual(self.manifest['historicalDataStatementCount'],34)
        self.assertEqual(self.manifest['historicalDoBlockCount'],18)
        self.assertEqual(len(self.manifest['historicalDataOperations']),34)
        self.assertEqual(len(self.manifest['historicalDoBlocks']),18)
        self.assertEqual(set(x['sha256'] for x in self.manifest['historicalDataOperations']),
                         set(x['sha256'] for x in self.inv['dataOperations']))
        self.assertEqual(set(x['sha256'] for x in self.manifest['historicalDoBlocks']),
                         set(x['sha256'] for x in self.inv['doBlocks']))
        self.assertTrue(all(x['disposition'] and x['disposition'] != 'unknown'
                            for x in self.manifest['historicalDataOperations']))
        self.assertTrue(all(x['disposition'] and x['disposition'] != 'unknown'
                            for x in self.manifest['historicalDoBlocks']))
        historical = self.manifest['liveMissingIndexDecisions']
        self.assertEqual(len(historical),34)
        self.assertEqual(sum(x['disposition']=='restored_from_historical_statement'
                             for x in historical),9)
        self.assertEqual(sum(x['disposition']=='excluded_renamed_column'
                             for x in historical),3)
        self.assertEqual(sum(x['disposition']=='excluded_retired_table'
                             for x in historical),22)

    def test_read_only_manifest_and_schema_cannot_mark_applied(self):
        self.assertEqual(self.manifest['purpose'],
                         'REVIEW_ONLY_FRESH_EMPTY_POSTGRES_NEVER_EXISTING_DB')
        self.assertEqual(self.manifest['migrationCount'],163)
        self.assertNotIn('_prisma_migrations',self.all_sql.lower())
        self.assertNotRegex(self.all_sql.lower(),r'\bmigrate\s+resolve\b')

    def test_verify_mode_does_not_rewrite_candidate(self):
        old={str(p):p.stat().st_mtime_ns for p in (BASELINE,EXTRAS,SEEDS,COMBINED,SNAPSHOT)}
        result=subprocess.run([sys.executable,str(DIRECTORY/'assemble.py'),'--verify'],
            capture_output=True,text=True,timeout=12,check=False)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('PASS bootstrap read-only parity',result.stdout)
        self.assertEqual(old,{str(p):p.stat().st_mtime_ns for p in (BASELINE,EXTRAS,SEEDS,COMBINED,SNAPSHOT)})

if __name__=='__main__': unittest.main()
