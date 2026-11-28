#!/usr/bin/env node
/** Domain-server packages must not depend back on the Core compatibility facade. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['achievements-server', 'consent-server', 'mobile-intro-server', 'notifications-server', 'feature-flags-server', 'admin-rewarded-ads-server', 'tracking-server', 'admin-reengagement-server'];
const violations = [];
let modules = 0;

// Legacy installers not yet migrated must run before the first HTTP route import;
// retired VK installers must not be required by this architecture guard.
function hasEarlyCompositionInstall(app, installerPath) {
  const marker = `import "./modules/${installerPath}";`;
  const firstRoute = 'import { internalFeedRoutes }';
  return app.includes(marker) && app.indexOf(marker) < app.indexOf(firstRoute);
}
const importedServerPackages = new Map();

function inspectFile(file, handler) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  function walk(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      handler(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) handler(arg.text);
      else violations.push(`${path.relative(project,file)}: nonliteral require/import`);
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
}

for (const name of packages) {
  const root = path.join(project,'packages',name);
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if (manifest.name !== '@gafus/'+name) violations.push(`${name}: unexpected package name`);
  // Resolve declared package entrypoints from source, without relying on prebuilt dist.
  if (manifest.types !== './dist/index.d.ts') violations.push(`${name}: missing classic TypeScript root types`);
  for (const [entry, fields] of Object.entries(manifest.exports || {})) {
    const basename = entry === '.' ? 'index' : entry.startsWith('./') ? entry.slice(2) : null;
    if (!basename || basename.includes('..') || basename.includes('/')) {
      violations.push(`${name}: unexpected export entry ${entry}`);
      continue;
    }
    if (!fs.existsSync(path.join(root, 'src', `${basename}.ts`)))
      violations.push(`${name}: export ${entry} missing source ${basename}.ts`);
    if (fields?.types !== `./dist/${basename}.d.ts` || fields?.default !== `./dist/${basename}.js`)
      violations.push(`${name}: export ${entry} must resolve built JavaScript and declaration paths`);
    if (entry !== '.' && manifest.typesVersions?.['*']?.[basename]?.[0] !== `dist/${basename}.d.ts`)
      violations.push(`${name}: missing classic TypeScript typesVersions for ${entry}`);
  }
  if (!manifest.exports?.['.']) violations.push(`${name}: missing root package export`);
  if (manifest.dependencies?.['@gafus/core'] || manifest.dependencies?.['@gafus/core-client'])
    violations.push(`${name}: dependency on Core facade/client`);
  for (const item of fs.readdirSync(path.join(root,'src'),{withFileTypes:true})) {
    if (!item.isFile() || !item.name.endsWith('.ts') || item.name.endsWith('.test.ts')) continue;
    const file = path.join(root,'src',item.name);
    modules++;
    inspectFile(file,(spec) => {
      if (spec === '@gafus/core' || spec.startsWith('@gafus/core/') ||
          spec === '@gafus/core-client' || spec.startsWith('@gafus/core-client/'))
        violations.push(`${name}/${item.name}: backward Core dependency ${spec}`);
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file),spec);
        if (!target.startsWith(path.join(root,'src')+path.sep))
          violations.push(`${name}/${item.name}: relative import escaped package (${spec})`);
      } else if (spec.startsWith('@gafus/')) {
        // A workspace dependency is declared by its package name, while a
        // subpath must be an explicitly exported entry of that same package.
        const [scope, packageName, ...segments] = spec.split('/');
        const packageId = scope + '/' + packageName;
        if (!Object.hasOwn(manifest.dependencies || {}, packageId)) {
          violations.push(`${name}/${item.name}: undeclared workspace dependency ${spec}`);
        } else if (segments.length) {
          const targetManifest = path.join(project, 'packages', packageName, 'package.json');
          const entry = './' + segments.join('/');
          if (!fs.existsSync(targetManifest) ||
              !Object.hasOwn(JSON.parse(fs.readFileSync(targetManifest, 'utf8')).exports || {}, entry)) {
            violations.push(`${name}/${item.name}: unexported workspace subpath ${spec}`);
          }
        }
        if (packages.some(p => packageId === '@gafus/'+p) && packageId !== manifest.name)
          importedServerPackages.set(`${name} -> ${spec}`,true);
      }
    });
  }
  const facades = {
    'achievements-server':'achievements',
    'consent-server':'consent',
    'mobile-intro-server':'mobileIntro',
    'notifications-server':'notifications',
    'feature-flags-server':'appFeatureFlags',
    'admin-rewarded-ads-server':'adminRewardedAds',
    'tracking-server':'tracking',
    'admin-reengagement-server':'adminReengagement',
  };
  const legacyName = facades[name];
  const facadePath = path.join(project, "packages/core/src/services", legacyName, "index.ts");
  const coreManifest = JSON.parse(fs.readFileSync(
    path.join(project, "packages/core/package.json"), "utf8",
  ));
  const publicEntry = "./services/" + legacyName;
  const hasPublicExport = Object.hasOwn(coreManifest.exports ?? {}, publicEntry);
  const hasFacade = fs.existsSync(facadePath);
  const servicesRoot = fs.readFileSync(path.join(project, "packages/core/src/services/index.ts"), "utf8");
  const rootReexports = servicesRoot.includes('export * from "./' + legacyName + '";');
  if (!hasFacade) {
    // A fully migrated, private Core facade may be retired only if neither
    // package.exports nor the Core root still references its deleted code.
    if (hasPublicExport || rootReexports) {
      violations.push(name + ": retired facade has stale Core public export");
    }
    continue;
  }
  if (!hasPublicExport) {
    violations.push(name + ": existing facade is not a declared Core entrypoint");
    continue;
  }
  const legacy = fs.readFileSync(facadePath, "utf8");
  if (name === "tracking-server") {
    const moduleFacade = path.join(project, "packages/core/src/services/tracking/trackingService.ts");
    if (!fs.existsSync(moduleFacade) ||
        !fs.readFileSync(moduleFacade,"utf8").includes("@gafus/tracking-server/trackingService"))
      violations.push(name + ": missing compatibility service export");
  } else if (name === "feature-flags-server") {
    // Core only retains the flag contract. The transactional access policy
    // receives a reader at composition, without any process-global binder.
    const portSource = fs.readFileSync(path.join(project, "packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts"), "utf8");
    const policySource = fs.readFileSync(path.join(project, "packages/core/src/services/contentAccess/index.ts"), "utf8");
    const instanceSource = fs.readFileSync(path.join(project, "apps/api/src/modules/content-access/composition/transactional-policy-instance.ts"), "utf8");
    const appSource = fs.readFileSync(path.join(project, "apps/api/src/app.ts"), "utf8");
    if (portSource.includes("@gafus/feature-flags-server") ||
        /registerAppFeatureFlagsPort|installedPort|requirePort\(/.test(portSource) ||
        !policySource.includes("createTransactionalContentPolicy(") ||
        !policySource.includes("readGatingEnabled()") ||
        !instanceSource.includes('from "@gafus/feature-flags-server"') ||
        !instanceSource.includes("getAppFeatureFlagEnabled(APP_FEATURE_APP_SUBSCRIPTION_GATING, true)") ||
        appSource.includes("install-core-flags")) {
      violations.push(name + ": missing explicit flag policy composition or global binder reintroduced");
    }
    if (coreManifest.dependencies?.["@gafus/feature-flags-server"]) {
      violations.push(name + ": Core runtime manifest still depends on Persistence");
    }
  } else if (!legacy.includes('export * from "@gafus/' + name + '"')) {
    violations.push(name + ": missing Core compatibility facade");
  }
}
// Subscription status and chat entitlements are read by Persistence, never Core.
// Guard both the source boundary and the explicit API composition attachment.
{
  const service = fs.readFileSync(path.join(project,
    'packages/core/src/services/appSubscription/accessService.ts'), 'utf8');
  // Retired global installer must stay absent: each caller now supplies the
  // process-local read-only adapter explicitly, avoiding cross-request state.
  const retiredInstaller = path.join(project,
    'apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts');
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  const corePackage = JSON.parse(fs.readFileSync(path.join(project,
    'packages/core/package.json'), 'utf8'));
  if (service.includes('@gafus/subscription-read-server') ||
      service.includes('registerSubscriptionAccessPort') ||
      !service.includes('SUBSCRIPTION_ACCESS_PORT_UNBOUND') ||
      !service.includes('ports: SubscriptionAccessPorts')) {
    violations.push('subscription-read-server: missing fail-closed Core read port');
  }
  const instance = fs.readFileSync(path.join(project,
    'apps/api/src/modules/app-subscription/composition/subscription-access-instance.ts'),'utf8');
  const achievements = fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/achievements.ts'),'utf8');
  const offline = fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/offline.ts'),'utf8');
  const subscription = fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/app-subscription.ts'),'utf8');
  const chat = fs.readFileSync(path.join(project,
    'apps/api/src/modules/chat2/access.ts'),'utf8');
  if (!instance.includes('from "@gafus/subscription-read-server"') ||
      !instance.includes('export const subscriptionAccessPort: SubscriptionAccessPorts') ||
      fs.existsSync(retiredInstaller) ||
      app.includes('import "./modules/app-subscription/composition/install-core-subscription-access.js";') ||
      !achievements.includes('getAppSubscriptionAccess(owner, undefined, subscriptionAccessPort)') ||
      !offline.includes('getAppSubscriptionAccess(user.id, undefined, subscriptionAccessPort)') ||
      !subscription.includes('getAppSubscriptionAccess(user.id, undefined, subscriptionAccessPort)') ||
      !chat.includes('getCynologistEntitlements(userId, undefined, subscriptionAccessPort)')) {
    violations.push('subscription-read-server: API and Chat2 must explicitly inject authoritative entitlement port');
  }
  const consultation = fs.readFileSync(path.join(project,
    'packages/consultation-server/src/bookingApplication.ts'),'utf8');
  const consultationManifest = JSON.parse(fs.readFileSync(path.join(project,
    'packages/consultation-server/package.json'),'utf8'));
  if (!consultation.includes('import { getAppSubscriptionAccess, getCynologistEntitlements } from "@gafus/subscription-read-server"') ||
      consultationManifest.dependencies?.['@gafus/subscription-read-server'] !== 'workspace:*') {
    violations.push('subscription-read-server: consultation must compose authoritative access independently of API bootstrap');
  }
  if (corePackage.dependencies?.['@gafus/subscription-read-server']) {
    violations.push('subscription-read-server: Core still has a runtime Persistence dependency');
  }
}
// Rewarded-ad settings are a non-bypassable Persistence port; SQL and audit
// actor writes must never leak back into Core. Verify startup composition too.
{
  const coreService = fs.readFileSync(path.join(project,
    'packages/core/src/services/rewardedCredits/settingsService.ts'), 'utf8');
  const adapterFile = path.join(project,
    'apps/api/src/modules/rewarded-credits/composition/settings-rows-instance.ts');
  const adapter = fs.existsSync(adapterFile) ? fs.readFileSync(adapterFile, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (coreService.includes('@gafus/gafus-server/rewarded-settings') ||
      !coreService.includes('createRewardedSettingsService(') ||
      !coreService.includes('REWARDED_SETTINGS_DEPENDENCIES_REQUIRED') ||
      /registerRewardedSettingsPort|requireRewardedSettingsPort/.test(coreService)) {
    violations.push('gafus-server/rewarded-settings: Core lacks fail-closed settings port');
  }
  if (!adapter.includes('from "@gafus/gafus-server/rewarded-settings"') ||
      !adapter.includes('export const rewardedSettingsPort: RewardedSettingsPorts') ||
      app.includes('install-core-settings')) {
    violations.push('gafus-server/rewarded-settings: API settings adapter not installed before routes');
  }
}
// Course.version is a CAS/write safety boundary: Core may not import rows,
// and API must bind the complete owner-scoped row adapter before Hono routes.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/trainerCourse/courseVersionService.ts'), 'utf8');
  const installerFile = path.join(project,
    'apps/api/src/modules/trainer-courses/composition/install-core-version-rows.ts');
  const installer = fs.existsSync(installerFile) ? fs.readFileSync(installerFile, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (core.includes('@gafus/course-progress-server/course-version-rows') ||
      core.includes('registerCourseVersionRowsPort') ||
      !core.includes('COURSE_VERSION_PORT_UNBOUND') ||
      core.includes('COURSE_VERSION_PORT_ALREADY_BOUND') || core.includes('registerCourseVersionRowsPort')) {
    violations.push('course-version: Core SQL port is not fail-closed');
  }
  const instanceFile = path.join(project,
    'apps/api/src/modules/trainer-courses/composition/course-version-rows-instance.ts');
  const instance = fs.existsSync(instanceFile) ? fs.readFileSync(instanceFile,'utf8') : '';
  if (!instance.includes('from "@gafus/course-progress-server/course-version-rows"') ||
      !instance.includes('export const courseVersionRowsPort: CourseVersionRowsPort') ||
      !instance.includes('writeCourseNameVersionRows') ||
      !instance.includes('setCourseLogoVersionRows') ||
      fs.existsSync(installerFile) ||
      app.includes('import "./modules/trainer-courses/composition/install-core-version-rows.js";') ||
      !app.includes('import { courseVersionRowsPort } from "./modules/trainer-courses/composition/course-version-rows-instance.js";') ||
      !app.includes('createTrainerCoursesRoutes(courseVersionRowsPort, trainerCourseRows)')) {
    violations.push('course-version: explicit owner-CAS SQL adapter must be injected into live Hono route');
  }
}
// Registration transactions and DB-backed completion/nonce checks cannot be
// imported from Persistence by Core. An unbound port must reject, never allow
// a pending account to access protected authenticated APIs.
{
  const service = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/registrationUseCases.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/registration-context-instance.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (service.includes('@gafus/identity-write-server/registration-context-reads') ||
      service.includes('registerRegistrationContextPort') ||
      !service.includes('REGISTRATION_CONTEXT_PORT_UNBOUND') ||
      service.includes('REGISTRATION_CONTEXT_PORT_ALREADY_BOUND') || service.includes('registerRegistrationContextPort')) {
    violations.push('registration-context: missing Core fail-closed transaction/read port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-context-reads"') ||
      !fs.readFileSync(path.join(project, 'apps/api/src/middleware/auth.ts'), 'utf8')
        .includes('createAuthMiddleware(registrationContextPort)') ||
      app.includes('composition/install-registration-context.js')) {
    violations.push('registration-context: API transaction/read adapter not composed before routes');
  }
}
// Password-reset receipt must be consumed atomically with password change and
// session revocation. Core owns public errors and postcommit notices, not SQL.
{
  const source = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/passwordReset.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/install-password-reset.ts');
  const installerExists = fs.existsSync(installerPath);
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (source.includes('@gafus/identity-write-server/password-reset') ||
      source.includes('registerPasswordResetPort') ||
      !source.includes('PASSWORD_RESET_PORT_UNBOUND') ||
      !source.includes('ports: PasswordResetPorts')) {
    violations.push('password-reset: Core must consume receipts through a fail-closed port');
  }
  const instance = fs.readFileSync(path.join(project,
    'apps/api/src/modules/auth/composition/password-reset-instance.ts'),'utf8');
  const route = fs.readFileSync(path.join(project,'apps/api/src/routes/v1/auth.ts'),'utf8');
  if (!instance.includes('from "@gafus/identity-write-server/password-reset"') ||
      !instance.includes('export const passwordResetPort: PasswordResetPorts') ||
      !instance.includes('error instanceof ResetReceiptUnavailableError') ||
      installerExists ||
      app.includes('import "./modules/auth/composition/install-password-reset.js";') ||
      !route.includes('resetPassword(token, password, passwordResetPort)')) {
    violations.push('password-reset: API proof adapter and error identity not composed before routes');
  }
}
// Email-account reset and change are one authoritative Persistence boundary:
// throttle and rollback are DB CAS; Core owns provider ACK ordering and errors.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/emailAccountFlows.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/install-email-account-rows.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (core.includes('@gafus/identity-write-server/email-account-rows') ||
      core.includes('registerEmailAccountRowsPort') ||
      !core.includes('EMAIL_ACCOUNT_ROWS_PORT_UNBOUND') ||
      core.includes('EMAIL_ACCOUNT_ROWS_PORT_ALREADY_BOUND') || core.includes('registerEmailAccountRowsPort')) {
    violations.push('email-account-rows: Core must use a fail-closed delivery/SQL port');
  }
  const instance = fs.readFileSync(path.join(project,
    'apps/api/src/modules/auth/composition/email-account-rows-instance.ts'),'utf8');
  const route = fs.readFileSync(path.join(project, 'apps/api/src/routes/v1/auth.ts'),'utf8');
  if (!instance.includes('from "@gafus/identity-write-server/email-account-rows"') ||
      !instance.includes('export const emailAccountRows: EmailAccountRowsPort') ||
      fs.existsSync(installerPath) ||
      app.includes('import "./modules/auth/composition/install-email-account-rows.js";') ||
      !route.includes('sendPasswordResetRequestByEmail(email, emailAccountRows)') ||
      !route.includes('requestEmailChange(c.get("user").id, newEmail, currentPassword, emailAccountRows)') ||
      !route.includes('confirmEmailChangeByToken(token, emailAccountRows)')) {
    violations.push('email-account-rows: API authoritative SQL adapter must be installed before routes');
  }
}
// Credential registration is a single SQL transaction: replay lookup,
// created user, consent, promo referral and idempotency receipt must commit as
// one unit, with P2002 classifier belonging to the DB adapter.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/registerUserWithCredentials.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/credential-registration-instance.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (core.includes('@gafus/identity-write-server/registration-contract-rows') ||
      core.includes('registerCredentialRegistrationPort') ||
      !core.includes('CREDENTIAL_REGISTRATION_PORT_UNBOUND') ||
      core.includes('CREDENTIAL_REGISTRATION_PORT_ALREADY_BOUND') || core.includes('registerCredentialRegistrationPort')) {
    violations.push('credential-registration: Core lacks fail-closed one-transaction port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-contract-rows"') ||
      !installer.includes('export const credentialRegistrationPort') ||
      app.includes('auth/composition/install-credential-registration.js')) {
    violations.push('credential-registration: API persistence transaction not composed before routes');
  }
}
// Registration contract SQL calls cannot leak back into Core. The opaque
// transaction and advisory locks are provided by a single API-composed port.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/registrationContracts.ts'), 'utf8');
  const corePortFile = path.join(project,
    'packages/core/src/services/auth/registrationContractRowsPort.ts');
  const port = fs.existsSync(corePortFile) ? fs.readFileSync(corePortFile, 'utf8') : '';
  const installerFile = path.join(project,
    'apps/api/src/modules/auth/composition/registration-contract-rows-instance.ts');
  const installer = fs.existsSync(installerFile) ? fs.readFileSync(installerFile, 'utf8') : '';
  const app = fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if (core.includes('@gafus/identity-write-server/registration-contract-rows') ||
      !core.includes('requireRegistrationContractRowsPort') ||
      !port.includes('REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND') ||
      port.includes('REGISTRATION_CONTRACT_ROWS_PORT_ALREADY_BOUND') || port.includes('registerRegistrationContractRowsPort') ||
      !port.includes('RegistrationContractDbTx = unknown')) {
    violations.push('registration-contracts: Core does not have a fail-closed opaque SQL port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-contract-rows"') ||
      !installer.includes('export const registrationContractRows') ||
      !installer.includes('callback(tx)') ||
      app.includes('auth/composition/install-registration-contract-rows.js')) {
    violations.push('registration-contracts: Application has not composed authoritative Tx SQL rows before Hono routes');
  }
}
// Paid/private/article access MUST observe owner and subscription rows from
// Persistence, not Core SQL or a client role. Missing port fails closed.
{
  const policy = fs.readFileSync(path.join(project,
    'packages/core/src/services/contentAccess/policy.ts'), 'utf8');
  const instancePath = path.join(project,
    'apps/api/src/modules/content-access/composition/content-policy-instance.ts');
  const instance = fs.existsSync(instancePath) ? fs.readFileSync(instancePath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project,'apps/api/src/app.ts'), 'utf8');
  if (policy.includes('@gafus/entitlements-server/policy-reads') ||
      !policy.includes('createContentPolicy(') ||
      !policy.includes('CONTENT_POLICY_DEPENDENCIES_REQUIRED') ||
      /registerContentPolicyReadPort|requireContentPolicyReadPort/.test(policy)) {
    violations.push('content-policy: missing explicit owner-scoped SQL read dependencies');
  }
  if (!instance.includes('from "@gafus/entitlements-server/policy-reads"') ||
      !instance.includes('createContentPolicy(contentPolicyReads,') ||
      app.includes('install-policy-reads')) {
    violations.push('content-policy: Application does not explicitly compose authoritative owner/period SQL reader');
  }
}
// Grants and media eligibility are occurrence-scoped. Core supplies both the
// target resolver and canonical entitlement policy; one SQL adapter executes
// them against the same DB connection. No global Step/media-key fallbacks.
{
  const source=fs.readFileSync(path.join(project,
    'packages/core/src/services/contentAccess/index.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/content-access/composition/install-occurrence-reads.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(source.includes('from "@gafus/entitlements-server"')||
     source.includes('registerCourseOccurrenceReadsPort')||
     !source.includes('COURSE_OCCURRENCE_READ_PORT_UNBOUND')||
     !source.includes('reads: CourseOccurrenceReadsPort')){
    violations.push('course-occurrence: Core must use a fail-closed occurrence SQL port');
  }
  const instance=fs.readFileSync(path.join(project,
    'apps/api/src/modules/content-access/composition/occurrence-reads-instance.ts'),'utf8');
  const training=fs.readFileSync(path.join(project,
    'apps/api/src/modules/training/composition/sql-training-instance.ts'),'utf8');
  const video=fs.readFileSync(path.join(project,
    'apps/api/src/modules/video/composition/video-access.ts'),'utf8');
  const gafus=fs.readFileSync(path.join(project,
    'apps/api/src/modules/rewarded-credits/composition/gafus-access.ts'),'utf8');
  if(fs.existsSync(installerPath)||
     !instance.includes('from "@gafus/entitlements-server"')||
     !instance.includes('export const occurrenceReadPort: CourseOccurrenceReadsPort')||
     app.includes('import "./modules/content-access/composition/install-occurrence-reads.js";')||
     !training.includes('hasActiveGafusCourseStepAccess(input, occurrenceReadPort)')||
     !video.includes('now, transactionalContentPolicy.resolveCourseStepAccessTx, occurrenceReadPort)')||
     !gafus.includes('hasActiveGafusCourseStepAccess(input, occurrenceReadPort)')){
    violations.push('course-occurrence: API must explicitly inject SQL reader into Training, Gafus and Video');
  }
}
// Gafus balance/reward writers require one PostgreSQL transaction advisory
// lock. Only server SQL may acquire it; Core must not invent JS locking.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/gafus/locking.ts'),'utf8');
  const file=path.join(project,
    'apps/api/src/modules/gafus/composition/wallet-lock-instance.ts');
  const installer=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(core.includes('@gafus/gafus-server/wallet-lock') ||
     !core.includes('createGafusLockService(') ||
     !core.includes('GAFUS_WALLET_LOCK_DEPENDENCIES_REQUIRED') ||
     /registerGafusLockPort|installedGafusLockPort/.test(core) ||
     !core.includes('GAFUS_WALLET_OWNER_REQUIRED')){
    violations.push('gafus-wallet-lock: missing Core fail-closed transaction port');
  }
  if(!installer.includes('from "@gafus/gafus-server/wallet-lock"') ||
     !installer.includes('createGafusLockService(walletLockPort)') ||
     app.includes('install-wallet-lock')){
    violations.push('gafus-wallet-lock: Application must install server advisory lock before routes');
  }
}
// Live veterinary writes reserve durable cleanup in the SQL owner and must
// receive their repository explicitly, never through import-order registration.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/pets/petVetVisitService.ts'), 'utf8');
  const http = fs.readFileSync(path.join(project,
    'packages/core/src/services/pets/petVetVisitHttp.ts'), 'utf8');
  const api = fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/pet-vet-visits.ts'), 'utf8');
  const instance = fs.readFileSync(path.join(project,
    'apps/api/src/modules/pets/composition/vet-visit-rows-instance.ts'), 'utf8');
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (!instance.includes('from "@gafus/pets-server/vet-visit-write-rows"') ||
      !instance.includes('export const vetVisitRows: VetVisitRowsPort') ||
      !core.includes('requireVetVisitRowsPort(rows)') ||
      !core.includes('vetDb(()=>requireVetVisitRowsPort(rows).reservePetVetAttachment') ||
      !core.includes('vetDb(()=>requireVetVisitRowsPort(rows).removeOwnPetVetVisit') ||
      !http.includes('listPetVetVisits(petId, ownerId, rows)') ||
      !http.includes('savePetVetVisit(petId, ownerId, body, visitId, rows)') ||
      !api.includes('import { vetVisitRows }') ||
      api.split('    vetVisitRows,').length!==3 ||
      app.includes('import "./modules/pets/composition/install-vet-visit-rows.js";')) {
    violations.push('vet-visits: authoritative owner-scoped transactional SQL adapter must be explicitly injected into both Hono routes');
  }
}
// Feed recovery may verify S3 metadata in Core but never lock or write
// FeedPost/FeedUpload directly. Atomic transition and client-first staging
// fencing belong to feed-server and are injected into the runtime.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/feed/recovery.ts'),'utf8');
  const server=fs.readFileSync(path.join(project,
    'packages/feed-server/src/uploadRecoveryRows.ts'),'utf8');
  const root=fs.readFileSync(path.join(project,
    'packages/feed-server/src/runtimeServices.ts'),'utf8');
  if (core.includes('FeedDb') || core.includes('FeedTx') ||
      core.includes('feedUpload.findMany') || core.includes('$transaction') ||
      core.includes('$queryRaw') ||
      !core.includes('input.rows.confirmVerifiedSource(upload, metadata.etag, now)') ||
      !server.includes('tx.$queryRaw`SELECT "id" FROM "FeedPost"') ||
      !server.includes('feed-client-video-staging:') ||
      !server.includes('return db.$transaction(async tx =>') ||
      !root.includes('createFeedUploadRecovery({ rows: createFeedUploadRecoveryRows(prisma), storage })')) {
    violations.push('feed-recovery: transactional SQL and device-first staging must live in feed-server with an explicit Core port');
  }
}
// Only a committed PostgreSQL revision can authorize lesson cache reuse.
// Redis hints are not proof; missing reader or DB row bypasses cache (null).
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/training/trainingContentRevision.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/training/composition/install-content-revision-read.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(core.includes('from "@gafus/course-read-server/content-revision"')||
    core.includes('registerCourseContentRevisionReadPort')||
    !core.includes('COURSE_CONTENT_REVISION_PORT_UNBOUND')||
    !core.includes('explicitReadPort: CourseContentRevisionReadPort')||
    !core.includes('return null;')){
    violations.push('course-content-revision: Core must use fail-closed DB revision port');
  }
  const instancePath=path.join(project,
    'apps/api/src/modules/training/composition/training-content-rows-instance.ts');
  const instance=fs.existsSync(instancePath)?fs.readFileSync(instancePath,'utf8'):'';
  const training=fs.readFileSync(path.join(project,
    'apps/api/src/modules/training/composition/sql-training-instance.ts'),'utf8');
  if(!instance.includes('from "@gafus/course-read-server/content-revision"')||
     !instance.includes('export const contentRevisionReadPort: CourseContentRevisionReadPort')||
     fs.existsSync(installerPath)||
     app.includes('import "./modules/training/composition/install-content-revision-read.js";')||
     !training.includes('revisionRows: contentRevisionReadPort')||
     !training.includes('getTrainingDayContent(courseType, dayOnCourseId, {')||
     !core.includes('explicitReadPort.readDurableCourseContentRevision()')) {
    violations.push('course-content-revision: Hono Training Service must receive committed DB revision port explicitly');
  }
}
// The course catalog read is owner-scoped in SQL; Core maintains visibility,
// exact actor membership and public wire projections. Protect against
// re-introducing a Core -> course-read-server adapter import or an unbound
// application composition root.
{
  const catalogCore=fs.readFileSync(path.join(project,
    'packages/core/src/services/course/courseService.ts'),'utf8');
  const portFile=path.join(project,
    'packages/core/src/services/course/catalogReadPort.ts');
  const port=fs.existsSync(portFile)?fs.readFileSync(portFile,'utf8'):'';
  const instancePath=path.join(project,
    'apps/api/src/modules/courses/composition/catalog-read-instance.ts');
  const instance=fs.existsSync(instancePath)?fs.readFileSync(instancePath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(catalogCore.includes('@gafus/course-read-server/legacy-catalog-rows') ||
     !catalogCore.includes('createCatalogReadService(') ||
     !catalogCore.includes('rows: CatalogReadPort') ||
     !catalogCore.includes('access.userId === userId') ||
     /registerCatalogReadPort|requireCatalogReadPort/.test(catalogCore+port)){
    violations.push('course-catalog: Core must use explicit owner-scoped catalog dependencies');
  }
  if(!instance.includes('from "@gafus/course-read-server/legacy-catalog-rows"') ||
     !instance.includes('createCatalogReadService(catalogReadPort, resolveCourseEntitlement)') ||
     app.includes('install-catalog-read')){
    violations.push('course-catalog: SQL reader must be explicitly composed, without global registration');
  }
}
// Lesson content snapshots may be cached only after a committed PostgreSQL
// content revision check. Core owns TTL/eviction; DB owns a course-scoped
// projection, not learner progress or authorization decisions.
{
  const service=fs.readFileSync(path.join(project,
    'packages/core/src/services/training/trainingDayContent.ts'),'utf8');
  const portFile=path.join(project,
    'packages/core/src/services/training/trainingDayContentReadPort.ts');
  const port=fs.existsSync(portFile)?fs.readFileSync(portFile,'utf8'):'';
  const installerPath=path.join(project,
    'apps/api/src/modules/training/composition/install-day-content-read.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/training/composition/install-day-content-read.js";';
  const instancePath=path.join(project,
    'apps/api/src/modules/training/composition/training-content-rows-instance.ts');
  const instance=fs.existsSync(instancePath)?fs.readFileSync(instancePath,'utf8'):'';
  const training=fs.readFileSync(path.join(project,
    'apps/api/src/modules/training/composition/sql-training-instance.ts'),'utf8');
  if(service.includes('from "@gafus/course-read-server"')||
     !service.includes('requireTrainingDayContentReadPort(contentRows)')||
     !service.includes('getVerifiedCourseContentRevision(contentPorts.revisionRows)')||
     !port.includes('TRAINING_DAY_CONTENT_READ_PORT_UNBOUND')||
     port.includes('registerTrainingDayContentReadPort')){
    violations.push('training-day-content: Core must require an exact course/day SQL port and validate committed revision');
  }
  if(!instance.includes('from "@gafus/course-read-server"')||
     !instance.includes('export const dayContentReadPort: TrainingDayContentReadPort')||
     fs.existsSync(installerPath)||
     app.includes(boot)||
     !training.includes('contentRows: dayContentReadPort')||
     !training.includes('revisionRows: contentRevisionReadPort')){
    violations.push('training-day-content: production Hono reader must inject matching content and version SQL ports');
  }
}
// Promotional discounts must use the SERIALIZABLE server transaction for
// revision+audit events. Core must not take over P2002 or SQL ownership.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/appSubscription/promoCodeService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/appSubscription/promoCodePort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const adapter=fs.readFileSync(path.join(project,
    'packages/subscription-finance-server/src/promoCodeRows.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/app-subscription/composition/install-promo-code-rows.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/app-subscription/composition/install-promo-code-rows.js";';
  if(core.includes('@gafus/subscription-finance-server/promo-code-rows') ||
     !core.includes('requireSubscriptionPromoPort(ports)') ||
     !port.includes('SUBSCRIPTION_PROMO_PORT_UNBOUND') ||
     port.includes('SUBSCRIPTION_PROMO_PORT_ALREADY_BOUND') || port.includes('registerSubscriptionPromoPort')) {
    violations.push('subscription-promo: missing fail-closed Core SQL transaction port');
  }
  const instance=fs.readFileSync(path.join(project,
    'apps/api/src/modules/app-subscription/composition/promo-code-rows-instance.ts'),'utf8');
  const api=fs.readFileSync(path.join(project,'apps/api/src/routes/v1/app-subscription.ts'),'utf8');
  const admin=fs.readFileSync(path.join(project,'apps/api/src/routes/v1/admin-subscriptions.ts'),'utf8');
  const readOffer=fs.readFileSync(path.join(project,
    'apps/api/src/modules/app-subscription/composition/read-offer.ts'),'utf8');
  if(!adapter.includes('TransactionIsolationLevel.Serializable') ||
     !adapter.includes('appSubscriptionPromoCodeEvent.createMany') ||
     !instance.includes('from "@gafus/subscription-finance-server/promo-code-rows"') ||
     !instance.includes('export const promoCodeSqlPort: SubscriptionPromoPort') ||
     fs.existsSync(installerPath) ||
     app.includes(boot) ||
     !api.includes('}, promoCodeSqlPort)') ||
     !admin.includes('createAppSubscriptionPromoCode({ ...parsed.data, actorId }, promoCodeSqlPort)') ||
     !admin.includes('updateAppSubscriptionPromoCode({ id: codeId, ...parsed.data, actorId }, promoCodeSqlPort)') ||
     !admin.includes('archiveAppSubscriptionPromoCode({ id: codeId, actorId }, promoCodeSqlPort)') ||
     !readOffer.includes('getAppSubscriptionPromoCodeOfferState(params, promoCodeSqlPort)')) {
    violations.push('subscription-promo: SERIALIZABLE SQL+audit adapter must be explicitly injected into API read, preview and admin writes');
  }
}
// Gafus wallet SQL must use same caller-owned PostgreSQL lock + atomic
// conditional balance update and idempotent ledger receipt. Core owns signed
// amount validation, duplicate-event policy and public wallet error codes.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/gafus/walletService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/gafus/gafusLedgerPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const sql=fs.readFileSync(path.join(project,
    'packages/gafus-server/src/walletRecords.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/gafus/composition/wallet-instance.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/gafus/composition/install-ledger-rows.js";';
  if(core.includes('@gafus/gafus-server/wallet-records')||
     !core.includes('createGafusWalletService(')||
     !core.includes('GAFUS_LEDGER_DEPENDENCIES_REQUIRED')||
     /registerGafusLedgerRowsPort|requireGafusLedgerRowsPort/.test(core+port)||
     !core.includes('GAFUS_IDEMPOTENCY_CONFLICT')||
     !core.includes('GAFUS_INSUFFICIENT_BALANCE')){
    violations.push('gafus-ledger: missing fail-closed transaction-local SQL port');
  }
  if(!sql.includes('updateMany')||!sql.includes('balance:{gte:-delta}')||
     !sql.includes('idempotencyKey')||
     !installer.includes('from "@gafus/gafus-server/wallet-records"')||
     !installer.includes('createGafusWalletService(ledgerRows)')||
     app.includes(boot)){
    violations.push('gafus-ledger: conditional debit and owner SQL adapter must be installed before routes');
  }
}
// Gafus unlock must atomically commit idempotent ledger SPEND and the exact
// target grant under one canonical PostgreSQL advisory lock. Neither Core
// nor API may create a separate connection between receipt/debit/grant.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/gafus/accessGrantService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/gafus/gafusUnlockPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const adapter=fs.readFileSync(path.join(project,
    'packages/gafus-server/src/unlock-records.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/gafus/composition/install-unlock-rows.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/gafus/composition/install-unlock-rows.js";';
  if(core.includes('@gafus/gafus-server/unlock-records')||
    !core.includes('requireGafusUnlockRowsPort(unlockRows)')||
    !core.includes('GAFUS_IDEMPOTENCY_CONFLICT')||
    !core.includes('changeGafusBalanceTx(tx,')||
    !port.includes('GAFUS_UNLOCK_PORT_UNBOUND')||
    port.includes('GAFUS_UNLOCK_PORT_ALREADY_BOUND') || port.includes('registerGafusUnlockRowsPort')){
    violations.push('gafus-unlock: Core must bind the fail-closed one-transaction grant port');
  }
  const instance = fs.readFileSync(path.join(project,
    'apps/api/src/modules/gafus/composition/unlock-rows-instance.ts'),'utf8');
  const route = fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/gafus.ts'),'utf8');
  if(!adapter.includes('lockGafusUser(tx,userId)') ||
     !adapter.includes('maxWait:10_000,timeout:30_000') ||
     !adapter.includes('tx.gafusTargetAccess.create') ||
     !instance.includes('from "@gafus/gafus-server/unlock-records"') ||
     !instance.includes('export const unlockRows: GafusUnlockRowsPort') ||
     fs.existsSync(installerPath) ||
     app.includes(boot) ||
     !route.includes('import { unlockRows }') ||
     !route.includes('}, gafusWallet, transactionalContentPolicy, unlockRows);')) {
    violations.push('gafus-unlock: PostgreSQL lock+debit+grant adapter missing in API boot');
  }
}
// Trainer day author/step ownership must be fenced transactionally by SQL
// during creation/update/deletion, never as a preflight-only Core check.
{
  const service=fs.readFileSync(path.join(project,
    'packages/core/src/services/trainingDay/trainingDayService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/trainingDay/trainingDayRowsPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const adapter=fs.readFileSync(path.join(project,
    'packages/course-progress-server/src/trainingDayRows.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/trainer-days/composition/install-training-day-rows.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/trainer-days/composition/install-training-day-rows.js";';
  if(service.includes('@gafus/course-progress-server/training-day-rows')||
     !service.includes('requireTrainingDayRowsPort(rowsPort)')||
     !port.includes('TRAINING_DAY_ROWS_PORT_UNBOUND')||
     port.includes('TRAINING_DAY_ROWS_PORT_ALREADY_BOUND') || port.includes('registerTrainingDayRowsPort')){
    violations.push('trainer-day-rows: missing Core fail-closed owner-scoped write port');
  }
  const explicitPath=path.join(project,
    'apps/api/src/modules/trainer-days/composition/training-day-rows-instance.ts');
  const explicit=fs.existsSync(explicitPath)?fs.readFileSync(explicitPath,'utf8'):'';
  const explicitComposition=
    explicit.includes('from "@gafus/course-progress-server/training-day-rows"') &&
    explicit.includes('export const trainingDayRows: TrainingDayRowsPort') &&
    app.includes('import { trainingDayRows } from "./modules/trainer-days/composition/training-day-rows-instance.js";') &&
    app.includes('createTrainerAuthoringRoutes(createProductionAuthoringPorts(trainingDayRows, trainerStepRows, trainerCourseRows))') &&
    app.includes('createTrainerDaysRoutes(trainingDayRows)') &&
    app.includes('createTrainerDayManageRoutes(createProductionTrainerContentPorts(trainingDayRows, trainerStepRows))') &&
    app.includes('createTrainerStepManageRoutes(createProductionTrainerContentPorts(trainingDayRows, trainerStepRows))') &&
    !app.includes(boot);
  if(!adapter.includes('STEP_OWNER_MISMATCH')||
     !adapter.includes('DAY_DELETE_RACE')||
     !adapter.includes('authorId: actor.id')||
     (!explicitComposition || fs.existsSync(installerPath))){
    violations.push('trainer-day-rows: trainer day SQL adapter must reach both read and write routes with owner checks');
  }
}
// All full-form Course create/edit/draft writes and reads must receive the
// exact owner-scoped version/row SQL port from the composition root.
{
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const instance=fs.readFileSync(path.join(project,
    'apps/api/src/modules/trainer-courses/composition/trainer-course-rows-instance.ts'),'utf8');
  if(app.includes('import "./modules/trainer-courses/composition/install-trainer-course-rows.js";')||
     !instance.includes('export const trainerCourseRows: TrainerCourseRowsPort')||
     !instance.includes('@gafus/course-progress-server/trainer-course-rows')||
     !instance.includes('updateTrainerCourseRows')||
     !app.includes('createTrainerCoursesRoutes(courseVersionRowsPort, trainerCourseRows)')||
     !app.includes('createTrainerFullCourseRoutes(createProductionTrainerFullCoursePorts(trainerCourseRows))')||
     !app.includes('createProductionAuthoringPorts(trainingDayRows, trainerStepRows, trainerCourseRows)')){
    violations.push('trainer-course-rows: production must inject owner-scoped full-form SQL into read/create/edit routes');
  }
}
// Every trainer-step mutation and public read must receive an explicit typed
// SQL adapter; a module-level registration hides cross-instance state.
{
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const instance=fs.readFileSync(path.join(project,
    'apps/api/src/modules/trainer-steps/composition/trainer-step-rows-instance.ts'),'utf8');
  if(app.includes('import "./modules/trainer-steps/composition/install-trainer-step-rows.js";')||
     !instance.includes('export const trainerStepRows: TrainerStepRowsPort')||
     !instance.includes('@gafus/course-progress-server/trainer-step-rows')||
     !app.includes('createTrainerStepsRoutes(trainerStepRows)')||
     !app.includes('createTrainerTemplatesRoutes(trainerStepRows)')||
     !app.includes('createProductionAuthoringPorts(trainingDayRows, trainerStepRows, trainerCourseRows)')||
     !app.includes('createProductionTrainerContentPorts(trainingDayRows, trainerStepRows)')){
    violations.push('trainer-step-rows: production must inject owner-checked step SQL into all read/write surfaces');
  }
}
// Paid/rewarded video and course authorization is only based on real SQL
// owner-scoped UserStep/DayOnCourse/assignment projections, never global
// Step/media identifiers. Core owns role/paid/private/legacy Gafus policy.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/rewardedCredits/accessService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/rewardedCredits/rewardedAccessReadPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const sql=fs.readFileSync(path.join(project,
    'packages/entitlements-server/src/rewardedAccessReads.ts'),'utf8');
  const installerPath=path.join(project,
    'apps/api/src/modules/rewarded-credits/composition/access-reads-instance.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/rewarded-credits/composition/install-access-reads.js";';
  if(core.includes('@gafus/entitlements-server/rewarded-access-reads')||
     !core.includes('createRewardedAccessPolicy(')||
     !core.includes('REWARDED_ACCESS_DEPENDENCIES_REQUIRED')||
     /registerRewardedAccessReadPort|requireRewardedAccessReadPort/.test(core+port)){
    violations.push('rewarded-access: missing fail-closed owner-scoped Core SQL read port');
  }
  if(!sql.includes('userTrainings: { some: { userId } }')||
     !sql.includes('userTraining: { userId }')||
     !sql.includes('courseAccess.findFirst')||
     !installer.includes('from "@gafus/entitlements-server/rewarded-access-reads"')||
     !installer.includes('export const rewardedAccessReader: RewardedAccessReadPort')||
     app.includes(boot)){
    violations.push('rewarded-access: actor/occurrence SQL projection missing before Hono routes');
  }
}
// AG4 reminder mutation receipts are intentionally SOURCE REVIEW ONLY.
// Migrating its SQL dependency into a port MUST NOT mount the draft API route,
// create a schema migration, or turn on reminder idempotency in production.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/reminders/reminderAG4ReviewPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const installerPath=path.join(project,
    'apps/api/src/modules/reminders/composition/reminder-rows.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const reviewRoute=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts'),'utf8');
  const activeRoute=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/reminders.ts'),'utf8');
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(core.includes('@gafus/identity-write-server/reminder-review-rows')||
     !core.includes('SOURCE REVIEW ONLY')||
     !core.includes('requireReminderAG4ReviewRowsPort(port)')||
     !port.includes('REMINDER_AG4_REVIEW_PORT_UNBOUND')||
     port.includes('registerReminderAG4ReviewRowsPort')){
    violations.push('reminder-ag4-review: Core source-only receipt port must fail closed');
  }
  if(!installer.includes('from "@gafus/identity-write-server/reminder-review-rows"')||
     !installer.includes('from "@gafus/core/services/reminders"')||
     !installer.includes('export const reminderRows: ReminderAG4ReviewRowsPort')||
     !reviewRoute.includes('}, key, reminderRows)')||
     !activeRoute.includes('}, idempotencyKey, reminderRows)')||
     app.includes('install-ag4-review-rows.review')||
     app.includes('g1-reminders-v2-unmounted.review')){
    violations.push('reminder-ag4-review: existing keyed route must bind compiled Core SQL port, without mounting review candidate');
  }
}
// OFF021 offline video position v3 remains source-review-only. The SQL adapter
// maintains one PostgreSQL transaction across exact occurrence authorization,
// unique receipt claim, FOR UPDATE revision and durable ACK CAS. No v3 router
// is mounted until a separately reviewed DB migration and dual-write policy.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/offline/offlineVideoPositionV3Service.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/offline/offlineVideoSqlPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const rows=fs.readFileSync(path.join(project,
    'packages/course-progress-server/src/offlineVideoRows.ts'),'utf8');
  const composerPath=path.join(project,
    'apps/api/src/modules/offline/composition/video-position-v3-review-instance.ts');
  const composer=fs.existsSync(composerPath)?fs.readFileSync(composerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const route=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/offline.ts'),'utf8');
  if(core.includes('@gafus/course-progress-server/offline-video-rows')||
     !core.includes('requireOfflineVideoSqlPort(port)')||
     !core.includes('authorizeVideoOccurrenceV3(tx, ownerId, parsed, resolveAccess, now)')||
     !core.includes('IDEMPOTENCY_KEY_CONFLICT')||
     !core.includes('STALE_VIDEO_REVISION')||
     !port.includes('OFFLINE_VIDEO_SQL_PORT_UNBOUND')||
     port.includes('registerOfflineVideoSqlPort')){
    violations.push('offline-video-v3: Core must use an atomic fail-closed exact-occurrence SQL port');
  }
  if(!rows.includes('prisma.$transaction(cb, { timeout: 10000 })')||
     !rows.includes('ON CONFLICT ("ownerId","eventId") DO NOTHING')||
     !rows.includes('FOR UPDATE')||
     !rows.includes('AND "revision"=${expectedRevision}')||
     !rows.includes('"responseStatus"=200')||
     !composer.includes('from "@gafus/course-progress-server/offline-video-rows"')||
     !composer.includes('export const offlineVideoSql: OfflineVideoSqlPort')||
     app.includes('video-position-v3-review-instance')||
     route.includes('video-position-v3-review-instance')||
     route.includes('submitVideoPositionV2Proposal')){
    violations.push('offline-video-v3: atomic receipt+revision SQL composer must remain UNMOUNTED');
  }
}
// Legacy rewarded-ad credit wallet (distinct from Gafus points): preserve
// one owner-scoped PostgreSQL advisory transaction for credits, deferred
// refunds and unique EARN/SPEND/REFUND receipts. Core must not import SQL or
// reach Prisma methods through the opaque rewarded transaction token.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/rewardedCredits/walletService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/rewardedCredits/rewardedWalletPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const sql=fs.readFileSync(path.join(project,
    'packages/gafus-server/src/rewardedWalletRows.ts'),'utf8');
  const composerPath=path.join(project,
    'apps/api/src/modules/rewarded-credits/composition/wallet-rows-instance.ts');
  const composer=fs.existsSync(composerPath)?fs.readFileSync(composerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/rewarded-credits/composition/install-wallet-rows.js";';
  if(core.includes('@gafus/gafus-server/rewarded-wallet-rows')||
     !core.includes('rows.withLockedRewardedWallet(') || !core.includes('createRewardedWalletService(')||
     !core.includes('REWARDED_MAX_CREDIT_BALANCE')||
     !core.includes('REWARDED_DAILY_LIMIT_TIMEZONE')||
     !core.includes('REWARDED_WALLET_DEPENDENCIES_REQUIRED')|| /registerRewardedWalletPort|requireRewardedWalletPort/.test(core+port)||
     !port.includes('rewardedWalletTxBrand')){
    violations.push('rewarded-wallet: Core must use opaque fail-closed owner-locked SQL port');
  }
  if(!sql.includes('prisma.$transaction(async (tx) =>')||
     !sql.includes('pg_advisory_xact_lock(hashtext($1))')||
     !sql.includes('`rewarded:${userId}`')||
     !sql.includes('rewardedCreditTransaction.findUnique')||
     !sql.includes('idempotencyKey')||
     !sql.includes('rewardedCreditWallet.update')||
     !composer.includes('from "@gafus/gafus-server/rewarded-wallet-rows"')||
     !composer.includes('export const rewardedWalletRows: RewardedWalletPort')||
     app.includes(boot) ||
     !app.includes('app.route("/api/v1/offline", createOfflineRoutes({') ||
     !app.includes('applyStepDayAndCourseTx: sqlTraining.applyStepDayAndCourseTx')){
    violations.push('rewarded-wallet: original PG owner lock, idempotency and SQL composer required before routes');
  }
}
// Profile Core remains the sole public DTO and avatar CDN compensation owner.
// The identity-write SQL adapter keeps per-owner profile UPDATE validation,
// private columns absent from public SELECT, and PG User row lock for avatar.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/user/profileService.ts'),'utf8');
  const portPath=path.join(project,
    'packages/core/src/services/user/profileRowsPort.ts');
  const port=fs.existsSync(portPath)?fs.readFileSync(portPath,'utf8'):'';
  const sql=fs.readFileSync(path.join(project,
    'packages/identity-write-server/src/profileRows.ts'),'utf8');
  const composerPath=path.join(project,
    'apps/api/src/modules/user/composition/install-profile-rows.ts');
  const composer=fs.existsSync(composerPath)?fs.readFileSync(composerPath,'utf8'):'';
  const instance=fs.readFileSync(path.join(project,
    'apps/api/src/modules/user/composition/profile-rows-instance.ts'),'utf8');
  const profileComposition=fs.readFileSync(path.join(project,
    'apps/api/src/modules/user/composition/profile.ts'),'utf8');
  const publicProfile=fs.readFileSync(path.join(project,
    'apps/api/src/modules/user/composition/read-public-profile.ts'),'utf8');
  const onboarding=fs.readFileSync(path.join(project,
    'apps/api/src/modules/user/composition/onboarding-tour.ts'),'utf8');
  const userRoutes=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/user.ts'),'utf8');
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/user/composition/install-profile-rows.js";';
  if(core.includes('@gafus/identity-write-server/profile-rows')||
    !core.includes('requireProfileRowsPort(rows)')||
    !core.includes('parseBirthDateEditWire')||
    !core.includes('getChatDisplayRole(user, (id, at) =>')||
    !core.includes('deleteFileFromCDN(priorKey)')||
    !port.includes('PROFILE_ROWS_PORT_UNBOUND')||
    port.includes('PROFILE_ROWS_PORT_ALREADY_BOUND') || port.includes('registerProfileRowsPort')){
    violations.push('profile-sql: Core must preserve strict private/public DTO and fail-closed owner-scoped port');
  }
  if(!sql.includes('PROFILE_OWNER_MISMATCH')||
     !sql.includes('WHERE "id" = ${userId} FOR UPDATE')||
     !sql.includes('tx.userProfile.upsert')||
     !sql.includes('where: { showInProfile: true }')||
     !sql.includes('where: { provider: "vk" }')||
     !instance.includes('from "@gafus/identity-write-server/profile-rows"')||
     !instance.includes('export const profileRows: ProfileRowsPort')||
     fs.existsSync(composerPath)||
     app.includes(boot)||
     !profileComposition.includes('getUserProfileForApi(userId, profileRows)')||
     !profileComposition.includes('updateUserProfile(userId, data, profileRows)')||
     !publicProfile.includes('getPublicProfile(username, profileRows)')||
     !onboarding.includes('getOnboardingTourStatus(userId, profileRows)')||
     !onboarding.includes('markOnboardingTourSeen(userId, profileRows)')||
     !userRoutes.includes('updateAvatar(user.id, file as File, profileRows)')||
     !app.includes('app.route("/api/v1/offline", createOfflineRoutes({') ||
     !app.includes('applyStepDayAndCourseTx: sqlTraining.applyStepDayAndCourseTx')){
    violations.push('profile-sql: canonical owner SQL and explicit per-service DI with avatar PG lock must be preserved');
  }
}
// Production Core must never regain a process-global adapter registry.
function checkExplicitCorePorts(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['__tests__', 'fixtures', 'test', 'tests'].includes(entry.name)) checkExplicitCorePorts(file);
    } else if (entry.isFile() && /\.tsx?$/.test(file) && !/\.(?:test|spec|d)\.tsx?$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8');
      if (/\b(?:function\s+register\w*Port\s*\(|(?:const|let|var)\s+register\w*Port\s*[=:])/.test(source)) {
        violations.push('Core global adapter registration forbidden: ' + path.relative(project, file));
      }
    }
  }
}
checkExplicitCorePorts(path.join(project, 'packages/core/src'));
if (importedServerPackages.size) {
  violations.push('Unexpected server-domain dependency: '+[...importedServerPackages.keys()].join(', '));
}
if (violations.length) {
  console.error('Server domain boundary FAIL:\n'+violations.join('\n'));
  process.exit(1);
}
console.log(`Server domain boundary PASS: ${packages.length} packages, ${modules} production modules, no Core back dependencies`);
