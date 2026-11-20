#!/usr/bin/env bash
# Disposable PostgreSQL proof that retiring VK OAuth never deletes existing users,
# provider identity links, paid subscriptions or training progress.
# No connection to production or an existing local PostgreSQL service.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
for bin in initdb pg_ctl createdb psql python3; do
  command -v "$bin" >/dev/null || { echo "ISOLATED_PG_TOOL_MISSING:$bin"; exit 2; }
done

DIR="$(mktemp -d /tmp/gafus-vk-retirement-qa.XXXXXX)"
PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
started=0
cleanup() {
  if [ "$started" = 1 ]; then
    pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true
  fi
  case "$DIR" in /tmp/gafus-vk-retirement-qa.*)
    if [ ! -L "$DIR" ]; then rm -rf -- "$DIR"; fi ;;
  esac
}
trap cleanup EXIT INT TERM

umask 077
initdb -D "$DIR/pg" -A trust -U vkretirementqa --no-instructions >"$DIR/init.log" 2>&1
pg_ctl -D "$DIR/pg" -l "$DIR/pg.log" -o "-h 127.0.0.1 -p $PORT -c timezone=UTC" -w start >/dev/null
started=1
createdb -h 127.0.0.1 -p "$PORT" -U vkretirementqa gafus_vk_retirement
export DATABASE_URL="postgresql://vkretirementqa@127.0.0.1:$PORT/gafus_vk_retirement?schema=public"
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=vkretirementqa PGDATABASE=gafus_vk_retirement

# Find the last committed pre-retirement schema, including after this branch
# is committed or cherry-picked. The test is intentionally source-history based.
BASE_REF="${GAFUS_LEGACY_VK_BASE_REF:-}"
if [ -z "$BASE_REF" ]; then
  while IFS= read -r candidate; do
    if git show "$candidate:packages/prisma/schema.prisma" >"$DIR/candidate.prisma" 2>/dev/null &&
       grep -q '^model VkRegistrationContext {' "$DIR/candidate.prisma" &&
       grep -q 'otaRequired[[:space:]]*Boolean' "$DIR/candidate.prisma" &&
       grep -q 'reviewEnabled[[:space:]]*Boolean' "$DIR/candidate.prisma"; then
      BASE_REF="$candidate"
      break
    fi
  done < <(git rev-list -n 30 HEAD -- packages/prisma/schema.prisma)
fi
if [ -z "$BASE_REF" ]; then
  echo 'PRE_RETIREMENT_SCHEMA_NOT_AVAILABLE: fetch project history, or set GAFUS_LEGACY_VK_BASE_REF'
  exit 3
fi
git show "$BASE_REF:packages/prisma/schema.prisma" >"$DIR/before.prisma"
pnpm --filter @gafus/prisma exec prisma db push --schema "$DIR/before.prisma" --skip-generate   >"$DIR/db-push.log" 2>&1 || {
    tail -n 45 "$DIR/db-push.log"
    exit 1
  }

psql -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO "User" ("id","username","email","password")
VALUES ('legacy-vk-qa','legacy-vk-qa','legacy-vk-qa@example.invalid','no-password')
     , ('creator-qa','creator-qa','creator-qa@example.invalid','password');
INSERT INTO "Account" ("id","userId","type","provider","providerAccountId")
VALUES ('vk-link-qa','legacy-vk-qa','oauth','vk-id','provider-id-123');
INSERT INTO "Course" ("id","name","type","trainingLevel","duration","logoImg","authorId","updatedAt")
VALUES ('course-vk-qa','Dog Training','course-vk-qa','BEGINNER','10 days','logo.png','creator-qa',NOW());
INSERT INTO "UserCourse" ("userId","courseId","status","updatedAt")
VALUES ('legacy-vk-qa','course-vk-qa','IN_PROGRESS',NOW());
INSERT INTO "AppSubscription" ("id","userId","provider","status","planCode","updatedAt")
VALUES ('paid-vk-qa','legacy-vk-qa','APPLE','ACTIVE','MONTHLY',NOW());
INSERT INTO "VkIdOneTimeLogin" ("id","tokenHash","userId","expiresAt")
VALUES ('legacy-token-qa','legacy-token-hash','legacy-vk-qa',NOW()+INTERVAL '1 hour');
INSERT INTO "VkRegistrationContext" ("id","contextTokenHash","stateHash","codeVerifier","purpose","expiresAt","updatedAt")
VALUES ('vk-context-qa','somecontextsha','somestatesha','test-verifier','REGISTER',NOW()+INTERVAL '1 hour',NOW());
INSERT INTO "VkLoginGrant" ("id","tokenHash","userId","purpose","expiresAt","registrationContextId")
VALUES ('vk-grant-qa','somegrantsha','legacy-vk-qa','LOGIN',NOW()+INTERVAL '1 hour','vk-context-qa');
INSERT INTO "AppFeatureFlag" ("key","enabled","reviewEnabled","updatedAt")
VALUES ('mobile_vk_login_ios',false,true,NOW()),('app_subscription_gating_enabled',true,false,NOW());
INSERT INTO "MobileAppReleasePolicy" ("key","iosReviewVersion","otaRequired","revision","updatedAt")
VALUES ('default','1.7.5',false,7,NOW());
SQL

psql -v ON_ERROR_STOP=1 -f   packages/prisma/migrations/20261118201500_remove_vk_review_profiles/migration.sql   >"$DIR/migration.log" 2>&1 || { cat "$DIR/migration.log"; exit 1; }

psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT COUNT(*) FROM "User" WHERE "id"='legacy-vk-qa') <> 1
 OR (SELECT COUNT(*) FROM "Account" WHERE "id"='vk-link-qa') <> 1
 OR (SELECT COUNT(*) FROM "Course" WHERE "id"='course-vk-qa') <> 1
 OR (SELECT COUNT(*) FROM "UserCourse" WHERE "userId"='legacy-vk-qa') <> 1
 OR (SELECT COUNT(*) FROM "AppSubscription" WHERE "id"='paid-vk-qa' AND "status"='ACTIVE') <> 1
 THEN RAISE EXCEPTION 'HISTORICAL_ACCOUNT_SUBSCRIPTION_OR_PROGRESS_REMOVED';
 END IF;
 IF to_regclass('"VkRegistrationContext"') IS NOT NULL
 OR to_regclass('"VkLoginGrant"') IS NOT NULL
 OR to_regclass('"VkIdOneTimeLogin"') IS NOT NULL
 THEN RAISE EXCEPTION 'RETIRED_OAUTH_TABLE_REMAINS'; END IF;
 IF (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='MobileAppReleasePolicy' AND column_name='iosReviewVersion') <> 0
 OR (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='AppFeatureFlag' AND column_name='reviewEnabled') <> 0
 THEN RAISE EXCEPTION 'REVIEW_PROFILE_COLUMN_REMAINS'; END IF;
 IF (SELECT COUNT(*) FROM "AppFeatureFlag" WHERE "key"='mobile_vk_login_ios') <> 0
 OR (SELECT COUNT(*) FROM "AppFeatureFlag" WHERE "key"='app_subscription_gating_enabled' AND "enabled") <> 1
 OR (SELECT "revision" FROM "MobileAppReleasePolicy" WHERE "key"='default') <> 7
 THEN RAISE EXCEPTION 'WRONG_FEATURE_FLAGS_OR_RELEASE_REVISION'; END IF;
END $$;
SQL
echo "VK_REVIEW_MIGRATION_ISOLATED_PG_PASS: original accounts, active Apple subscription, course progress and OTA revision preserved"
