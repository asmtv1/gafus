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
        if (!Object.hasOwn(manifest.dependencies || {},spec))
          violations.push(`${name}/${item.name}: undeclared workspace dependency ${spec}`);
        if (packages.some(p => spec === '@gafus/'+p) && spec !== manifest.name)
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
    // The former Core -> Persistence re-export is retired. The replacement is a
    // fail-closed, explicitly composed port, never a hidden transitive import.
    const portPath = path.join(project, "packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts");
    const installerPath = path.join(project, "apps/api/src/modules/app-feature-flags/composition/install-core-flags.ts");
    const appSource = fs.readFileSync(path.join(project, "apps/api/src/app.ts"), "utf8");
    const portSource = fs.existsSync(portPath) ? fs.readFileSync(portPath, "utf8") : "";
    const installerSource = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, "utf8") : "";
    if (portSource.includes("@gafus/feature-flags-server") ||
        !portSource.includes("registerAppFeatureFlagsPort") ||
        !portSource.includes("APP_FEATURE_FLAGS_PORT_UNBOUND") ||
        !portSource.includes("APP_FEATURE_FLAGS_PORT_ALREADY_BOUND")) {
      violations.push(name + ": Core feature-flag port missing or permits an unbound adapter");
    }
    if (!installerSource.includes('from "@gafus/feature-flags-server/appFeatureFlagsService"') ||
        !installerSource.includes("registerAppFeatureFlagsPort(featureFlagsPort)") ||
        !appSource.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";')) {
      violations.push(name + ": missing API feature-flag composition before routing");
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
  const installer = fs.readFileSync(path.join(project,
    'apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts'), 'utf8');
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  const corePackage = JSON.parse(fs.readFileSync(path.join(project,
    'packages/core/package.json'), 'utf8'));
  if (service.includes('@gafus/subscription-read-server') ||
      !service.includes('registerSubscriptionAccessPort') ||
      !service.includes('SUBSCRIPTION_ACCESS_PORT_UNBOUND') ||
      !service.includes('SUBSCRIPTION_ACCESS_PORT_ALREADY_BOUND')) {
    violations.push('subscription-read-server: missing fail-closed Core read port');
  }
  if (!installer.includes('from "@gafus/subscription-read-server"') ||
      !installer.includes('registerSubscriptionAccessPort(subscriptionAccessPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";')) {
    violations.push('subscription-read-server: API read port is not installed at composition root');
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
    'apps/api/src/modules/rewarded-credits/composition/install-core-settings.ts');
  const adapter = fs.existsSync(adapterFile) ? fs.readFileSync(adapterFile, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (coreService.includes('@gafus/gafus-server/rewarded-settings') ||
      !coreService.includes('registerRewardedSettingsPort') ||
      !coreService.includes('REWARDED_SETTINGS_PORT_UNBOUND') ||
      !coreService.includes('REWARDED_SETTINGS_PORT_ALREADY_BOUND')) {
    violations.push('gafus-server/rewarded-settings: Core lacks fail-closed settings port');
  }
  if (!adapter.includes('from "@gafus/gafus-server/rewarded-settings"') ||
      !adapter.includes('registerRewardedSettingsPort(rewardedSettingsPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";')) {
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
      !core.includes('registerCourseVersionRowsPort') ||
      !core.includes('COURSE_VERSION_PORT_UNBOUND') ||
      !core.includes('COURSE_VERSION_PORT_ALREADY_BOUND')) {
    violations.push('course-version: Core SQL port is not fail-closed');
  }
  if (!installer.includes('from "@gafus/course-progress-server/course-version-rows"') ||
      !installer.includes('registerCourseVersionRowsPort(courseVersionRowsPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";')) {
    violations.push('course-version: API owner-CAS adapter not composed before routing');
  }
}
// Registration transactions and DB-backed completion/nonce checks cannot be
// imported from Persistence by Core. An unbound port must reject, never allow
// a pending account to access protected authenticated APIs.
{
  const service = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/registrationUseCases.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/install-registration-context.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (service.includes('@gafus/identity-write-server/registration-context-reads') ||
      !service.includes('registerRegistrationContextPort') ||
      !service.includes('REGISTRATION_CONTEXT_PORT_UNBOUND') ||
      !service.includes('REGISTRATION_CONTEXT_PORT_ALREADY_BOUND')) {
    violations.push('registration-context: missing Core fail-closed transaction/read port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-context-reads"') ||
      !installer.includes('registerRegistrationContextPort(registrationContextPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";')) {
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
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (source.includes('@gafus/identity-write-server/password-reset') ||
      !source.includes('registerPasswordResetPort') ||
      !source.includes('PASSWORD_RESET_PORT_UNBOUND') ||
      !source.includes('PASSWORD_RESET_PORT_ALREADY_BOUND')) {
    violations.push('password-reset: Core must consume receipts through a fail-closed port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/password-reset"') ||
      !installer.includes('registerPasswordResetPort(passwordResetPort)') ||
      !installer.includes('error instanceof ResetReceiptUnavailableError') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";')) {
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
      !core.includes('registerEmailAccountRowsPort') ||
      !core.includes('EMAIL_ACCOUNT_ROWS_PORT_UNBOUND') ||
      !core.includes('EMAIL_ACCOUNT_ROWS_PORT_ALREADY_BOUND')) {
    violations.push('email-account-rows: Core must use a fail-closed delivery/SQL port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/email-account-rows"') ||
      !installer.includes('registerEmailAccountRowsPort(emailAccountRowsPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";\n' +
        'import "./modules/auth/composition/install-email-account-rows.js";')) {
    violations.push('email-account-rows: API authoritative SQL adapter must be installed before routes');
  }
}
// VK completion must keep the context advisory lock around consent, referral,
// pending-user CAS, receipt marker and LOGIN-grant replay. Core owns policy.
{
  const service = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/vkRegistrationCompletion.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/install-vk-completion.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (service.includes('@gafus/identity-write-server/vk-completion-rows') ||
      !service.includes('registerVkCompletionPort') ||
      !service.includes('VK_COMPLETION_PORT_UNBOUND') ||
      !service.includes('VK_COMPLETION_PORT_ALREADY_BOUND')) {
    violations.push('vk-completion: Core lacks fail-closed single-transaction port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/vk-completion-rows"') ||
      !installer.includes('registerVkCompletionPort(vkCompletionPort)') ||
      !installer.includes('completedConsentLogStatus') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";\n' +
        'import "./modules/auth/composition/install-email-account-rows.js";\n' +
        'import "./modules/auth/composition/install-vk-completion.js";')) {
    violations.push('vk-completion: API context-locked consent completion adapter missing at startup');
  }
}
// Credential registration is a single SQL transaction: replay lookup,
// created user, consent, promo referral and idempotency receipt must commit as
// one unit, with P2002 classifier belonging to the DB adapter.
{
  const core = fs.readFileSync(path.join(project,
    'packages/core/src/services/auth/registerUserWithCredentials.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/auth/composition/install-credential-registration.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project, 'apps/api/src/app.ts'), 'utf8');
  if (core.includes('@gafus/identity-write-server/registration-contract-rows') ||
      !core.includes('registerCredentialRegistrationPort') ||
      !core.includes('CREDENTIAL_REGISTRATION_PORT_UNBOUND') ||
      !core.includes('CREDENTIAL_REGISTRATION_PORT_ALREADY_BOUND')) {
    violations.push('credential-registration: Core lacks fail-closed one-transaction port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-contract-rows"') ||
      !installer.includes('registerCredentialRegistrationPort(credentialRegistrationPort)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";\n' +
        'import "./modules/auth/composition/install-email-account-rows.js";\n' +
        'import "./modules/auth/composition/install-vk-completion.js";\n' +
        'import "./modules/auth/composition/install-credential-registration.js";')) {
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
    'apps/api/src/modules/auth/composition/install-registration-contract-rows.ts');
  const installer = fs.existsSync(installerFile) ? fs.readFileSync(installerFile, 'utf8') : '';
  const app = fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if (core.includes('@gafus/identity-write-server/registration-contract-rows') ||
      !core.includes('requireRegistrationContractRowsPort') ||
      !port.includes('REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND') ||
      !port.includes('REGISTRATION_CONTRACT_ROWS_PORT_ALREADY_BOUND') ||
      !port.includes('RegistrationContractDbTx = unknown')) {
    violations.push('registration-contracts: Core does not have a fail-closed opaque SQL port');
  }
  if (!installer.includes('from "@gafus/identity-write-server/registration-contract-rows"') ||
      !installer.includes('registerRegistrationContractRowsPort(rows)') ||
      !installer.includes('callback(tx)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";\n' +
        'import "./modules/auth/composition/install-email-account-rows.js";\n' +
        'import "./modules/auth/composition/install-vk-completion.js";\n' +
        'import "./modules/auth/composition/install-credential-registration.js";\n' +
        'import "./modules/auth/composition/install-registration-contract-rows.js";')) {
    violations.push('registration-contracts: Application has not composed authoritative Tx SQL rows before Hono routes');
  }
}
// Paid/private/article access MUST observe owner and subscription rows from
// Persistence, not Core SQL or a client role. Missing port fails closed.
{
  const policy = fs.readFileSync(path.join(project,
    'packages/core/src/services/contentAccess/policy.ts'), 'utf8');
  const installerPath = path.join(project,
    'apps/api/src/modules/content-access/composition/install-policy-reads.ts');
  const installer = fs.existsSync(installerPath) ? fs.readFileSync(installerPath, 'utf8') : '';
  const app = fs.readFileSync(path.join(project,'apps/api/src/app.ts'), 'utf8');
  if (policy.includes('@gafus/entitlements-server/policy-reads') ||
      !policy.includes('registerContentPolicyReadPort') ||
      !policy.includes('CONTENT_POLICY_READ_PORT_UNBOUND') ||
      !policy.includes('CONTENT_POLICY_READ_PORT_ALREADY_BOUND')) {
    violations.push('content-policy: missing fail-closed Core owner-scoped SQL read port');
  }
  if (!installer.includes('from "@gafus/entitlements-server/policy-reads"') ||
      !installer.includes('registerContentPolicyReadPort(contentPolicyReads)') ||
      !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n' +
        'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n' +
        'import "./modules/rewarded-credits/composition/install-core-settings.js";\n' +
        'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n' +
        'import "./modules/auth/composition/install-registration-context.js";\n' +
        'import "./modules/auth/composition/install-password-reset.js";\n' +
        'import "./modules/auth/composition/install-email-account-rows.js";\n' +
        'import "./modules/auth/composition/install-vk-completion.js";\n' +
        'import "./modules/auth/composition/install-credential-registration.js";\n' +
        'import "./modules/auth/composition/install-registration-contract-rows.js";\n' +
        'import "./modules/content-access/composition/install-policy-reads.js";')) {
    violations.push('content-policy: Application does not bind authoritative owner/period SQL reader before routes');
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
     !source.includes('registerCourseOccurrenceReadsPort')||
     !source.includes('COURSE_OCCURRENCE_READ_PORT_UNBOUND')||
     !source.includes('COURSE_OCCURRENCE_READ_PORT_ALREADY_BOUND')){
    violations.push('course-occurrence: Core must use a fail-closed occurrence SQL port');
  }
  if(!installer.includes('from "@gafus/entitlements-server"')||
     !installer.includes('registerCourseOccurrenceReadsPort(occurrenceReads)')||
     !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n'+
      'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n'+
      'import "./modules/rewarded-credits/composition/install-core-settings.js";\n'+
      'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n'+
      'import "./modules/auth/composition/install-registration-context.js";\n'+
      'import "./modules/auth/composition/install-password-reset.js";\n'+
      'import "./modules/auth/composition/install-email-account-rows.js";\n'+
      'import "./modules/auth/composition/install-vk-completion.js";\n'+
      'import "./modules/auth/composition/install-credential-registration.js";\n'+
      'import "./modules/auth/composition/install-registration-contract-rows.js";\n'+
      'import "./modules/content-access/composition/install-policy-reads.js";\n'+
      'import "./modules/content-access/composition/install-occurrence-reads.js";')){
    violations.push('course-occurrence: API did not bind SQL reader before Hono routes');
  }
}
// Gafus balance/reward writers require one PostgreSQL transaction advisory
// lock. Only server SQL may acquire it; Core must not invent JS locking.
{
  const core=fs.readFileSync(path.join(project,
    'packages/core/src/services/gafus/locking.ts'),'utf8');
  const file=path.join(project,
    'apps/api/src/modules/gafus/composition/install-wallet-lock.ts');
  const installer=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(core.includes('@gafus/gafus-server/wallet-lock') ||
     !core.includes('registerGafusLockPort') ||
     !core.includes('GAFUS_WALLET_LOCK_PORT_UNBOUND') ||
     !core.includes('GAFUS_WALLET_LOCK_PORT_ALREADY_BOUND') ||
     !core.includes('GAFUS_WALLET_OWNER_REQUIRED')){
    violations.push('gafus-wallet-lock: missing Core fail-closed transaction port');
  }
  if(!installer.includes('from "@gafus/gafus-server/wallet-lock"') ||
     !installer.includes('registerGafusLockPort(walletLockPort)') ||
     !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n'+
      'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n'+
      'import "./modules/rewarded-credits/composition/install-core-settings.js";\n'+
      'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n'+
      'import "./modules/auth/composition/install-registration-context.js";\n'+
      'import "./modules/auth/composition/install-password-reset.js";\n'+
      'import "./modules/auth/composition/install-email-account-rows.js";\n'+
      'import "./modules/auth/composition/install-vk-completion.js";\n'+
      'import "./modules/auth/composition/install-credential-registration.js";\n'+
      'import "./modules/auth/composition/install-registration-contract-rows.js";\n'+
      'import "./modules/content-access/composition/install-policy-reads.js";\n'+
      'import "./modules/content-access/composition/install-occurrence-reads.js";\n'+
      'import "./modules/gafus/composition/install-wallet-lock.js";')){
    violations.push('gafus-wallet-lock: Application must install server advisory lock before routes');
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
    !core.includes('registerCourseContentRevisionReadPort')||
    !core.includes('COURSE_CONTENT_REVISION_PORT_UNBOUND')||
    !core.includes('COURSE_CONTENT_REVISION_PORT_ALREADY_BOUND')||
    !core.includes('return null;')){
    violations.push('course-content-revision: Core must use fail-closed DB revision port');
  }
  if(!installer.includes('from "@gafus/course-read-server/content-revision"')||
    !installer.includes('registerCourseContentRevisionReadPort(contentRevisionReadPort)')||
    !app.startsWith('import "./modules/app-feature-flags/composition/install-core-flags.js";\n'+
      'import "./modules/app-subscription/composition/install-core-subscription-access.js";\n'+
      'import "./modules/rewarded-credits/composition/install-core-settings.js";\n'+
      'import "./modules/trainer-courses/composition/install-core-version-rows.js";\n'+
      'import "./modules/auth/composition/install-registration-context.js";\n'+
      'import "./modules/auth/composition/install-password-reset.js";\n'+
      'import "./modules/auth/composition/install-email-account-rows.js";\n'+
      'import "./modules/auth/composition/install-vk-completion.js";\n'+
      'import "./modules/auth/composition/install-credential-registration.js";\n'+
      'import "./modules/auth/composition/install-registration-contract-rows.js";\n'+
      'import "./modules/content-access/composition/install-policy-reads.js";\n'+
      'import "./modules/content-access/composition/install-occurrence-reads.js";\n'+
      'import "./modules/gafus/composition/install-wallet-lock.js";\n'+
      'import "./modules/training/composition/install-content-revision-read.js";')){
    violations.push('course-content-revision: API PostgreSQL revision reader missing before routes');
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
  const installerPath=path.join(project,
    'apps/api/src/modules/courses/composition/install-catalog-read.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/courses/composition/install-catalog-read.js";';
  if(catalogCore.includes('@gafus/course-read-server/legacy-catalog-rows') ||
     !catalogCore.includes('requireCatalogReadPort()') ||
     !catalogCore.includes('access.userId === userId') ||
     !port.includes('COURSE_CATALOG_READ_PORT_UNBOUND') ||
     !port.includes('COURSE_CATALOG_READ_PORT_ALREADY_BOUND')){
    violations.push('course-catalog: Core must use a fail-closed owner-scoped catalog read port');
  }
  if(!installer.includes('from "@gafus/course-read-server/legacy-catalog-rows"') ||
     !installer.includes('registerCatalogReadPort(catalogReadPort)') ||
     !app.includes(boot) ||
     app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
    violations.push('course-catalog: SQL reader must be composed before Hono routes');
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
  if(service.includes('from "@gafus/course-read-server"')||
     !service.includes('requireTrainingDayContentReadPort()')||
     !service.includes('getVerifiedCourseContentRevision()')||
     !port.includes('TRAINING_DAY_CONTENT_READ_PORT_UNBOUND')||
     !port.includes('TRAINING_DAY_CONTENT_READ_PORT_ALREADY_BOUND')){
    violations.push('training-day-content: Core needs fail-closed exact course/day projection port');
  }
  if(!installer.includes('from "@gafus/course-read-server"')||
     !installer.includes('registerTrainingDayContentReadPort(dayContentReadPort)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
    violations.push('training-day-content: SQL projection must be composed before Hono routes');
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
     !core.includes('requireSubscriptionPromoPort()') ||
     !port.includes('SUBSCRIPTION_PROMO_PORT_UNBOUND') ||
     !port.includes('SUBSCRIPTION_PROMO_PORT_ALREADY_BOUND')) {
    violations.push('subscription-promo: missing fail-closed Core SQL transaction port');
  }
  if(!adapter.includes('TransactionIsolationLevel.Serializable') ||
     !adapter.includes('appSubscriptionPromoCodeEvent.createMany') ||
     !installer.includes('from "@gafus/subscription-finance-server/promo-code-rows"') ||
     !installer.includes('registerSubscriptionPromoPort(promoCodeSqlPort)') ||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')) {
    violations.push('subscription-promo: SERIALIZABLE SQL+audit adapter missing from API boot');
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
    'apps/api/src/modules/gafus/composition/install-ledger-rows.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/gafus/composition/install-ledger-rows.js";';
  if(core.includes('@gafus/gafus-server/wallet-records')||
     !core.includes('requireGafusLedgerRowsPort()')||
     !port.includes('GAFUS_LEDGER_PORT_UNBOUND')||
     !port.includes('GAFUS_LEDGER_PORT_ALREADY_BOUND')||
     !core.includes('GAFUS_IDEMPOTENCY_CONFLICT')||
     !core.includes('GAFUS_INSUFFICIENT_BALANCE')){
    violations.push('gafus-ledger: missing fail-closed transaction-local SQL port');
  }
  if(!sql.includes('updateMany')||!sql.includes('balance:{gte:-delta}')||
     !sql.includes('idempotencyKey')||
     !installer.includes('from "@gafus/gafus-server/wallet-records"')||
     !installer.includes('registerGafusLedgerRowsPort(ledgerRows)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
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
    !core.includes('requireGafusUnlockRowsPort()')||
    !core.includes('GAFUS_IDEMPOTENCY_CONFLICT')||
    !core.includes('changeGafusBalanceTx(tx,')||
    !port.includes('GAFUS_UNLOCK_PORT_UNBOUND')||
    !port.includes('GAFUS_UNLOCK_PORT_ALREADY_BOUND')){
    violations.push('gafus-unlock: Core must bind the fail-closed one-transaction grant port');
  }
  if(!adapter.includes('lockGafusUser(tx,userId)')||
     !adapter.includes('maxWait:10_000,timeout:30_000')||
     !adapter.includes('tx.gafusTargetAccess.create')||
     !installer.includes('from "@gafus/gafus-server/unlock-records"')||
     !installer.includes('registerGafusUnlockRowsPort(unlockRows)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
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
     !service.includes('requireTrainingDayRowsPort()')||
     !port.includes('TRAINING_DAY_ROWS_PORT_UNBOUND')||
     !port.includes('TRAINING_DAY_ROWS_PORT_ALREADY_BOUND')){
    violations.push('trainer-day-rows: missing Core fail-closed owner-scoped write port');
  }
  if(!adapter.includes('STEP_OWNER_MISMATCH')||
     !adapter.includes('DAY_DELETE_RACE')||
     !adapter.includes('authorId: actor.id')||
     !installer.includes('from "@gafus/course-progress-server/training-day-rows"')||
     !installer.includes('registerTrainingDayRowsPort(trainingDayRows)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
    violations.push('trainer-day-rows: transactional author/step SQL adapter must bind before routes');
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
    'apps/api/src/modules/rewarded-credits/composition/install-access-reads.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/rewarded-credits/composition/install-access-reads.js";';
  if(core.includes('@gafus/entitlements-server/rewarded-access-reads')||
     !core.includes('requireRewardedAccessReadPort()')||
     !port.includes('REWARDED_ACCESS_READ_PORT_UNBOUND')||
     !port.includes('REWARDED_ACCESS_READ_PORT_ALREADY_BOUND')){
    violations.push('rewarded-access: missing fail-closed owner-scoped Core SQL read port');
  }
  if(!sql.includes('userTrainings: { some: { userId } }')||
     !sql.includes('userTraining: { userId }')||
     !sql.includes('courseAccess.findFirst')||
     !installer.includes('from "@gafus/entitlements-server/rewarded-access-reads"')||
     !installer.includes('registerRewardedAccessReadPort(rewardedAccessReader)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { internalFeedRoutes }')){
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
    'apps/api/src/modules/reminders/composition/install-ag4-review-rows.review.ts');
  const installer=fs.existsSync(installerPath)?fs.readFileSync(installerPath,'utf8'):'';
  const reviewRoute=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/g1-reminders-v2-unmounted.review.ts'),'utf8');
  const activeRoute=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/reminders.ts'),'utf8');
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  if(core.includes('@gafus/identity-write-server/reminder-review-rows')||
     !core.includes('SOURCE REVIEW ONLY')||
     !core.includes('requireReminderAG4ReviewRowsPort()')||
     !port.includes('REMINDER_AG4_REVIEW_PORT_UNBOUND')||
     !port.includes('REMINDER_AG4_REVIEW_PORT_ALREADY_BOUND')){
    violations.push('reminder-ag4-review: Core source-only receipt port must fail closed');
  }
  if(!installer.includes('from "@gafus/identity-write-server/reminder-review-rows"')||
     !installer.includes('from "@gafus/core/services/reminders"')||
     !installer.includes('reminderCore.registerReminderAG4ReviewRowsPort(reminderRows)')||
     !reviewRoute.includes('install-ag4-review-rows.review.js')||
     !activeRoute.includes('import "../../modules/reminders/composition/install-ag4-review-rows.review.js";')||
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
    'apps/api/src/modules/offline/composition/install-video-position-v3-review.ts');
  const composer=fs.existsSync(composerPath)?fs.readFileSync(composerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const route=fs.readFileSync(path.join(project,
    'apps/api/src/routes/v1/offline.ts'),'utf8');
  if(core.includes('@gafus/course-progress-server/offline-video-rows')||
     !core.includes('requireOfflineVideoSqlPort()')||
     !core.includes('authorizeVideoOccurrenceV3(tx, ownerId, parsed, now)')||
     !core.includes('IDEMPOTENCY_KEY_CONFLICT')||
     !core.includes('STALE_VIDEO_REVISION')||
     !port.includes('OFFLINE_VIDEO_SQL_PORT_UNBOUND')||
     !port.includes('OFFLINE_VIDEO_SQL_PORT_ALREADY_BOUND')){
    violations.push('offline-video-v3: Core must use an atomic fail-closed exact-occurrence SQL port');
  }
  if(!rows.includes('prisma.$transaction(cb, { timeout: 10000 })')||
     !rows.includes('ON CONFLICT ("ownerId","eventId") DO NOTHING')||
     !rows.includes('FOR UPDATE')||
     !rows.includes('AND "revision"=${expectedRevision}')||
     !rows.includes('"responseStatus"=200')||
     !composer.includes('from "@gafus/course-progress-server/offline-video-rows"')||
     !composer.includes('registerOfflineVideoSqlPort(offlineVideoSql)')||
     app.includes('install-video-position-v3-review')||
     route.includes('install-video-position-v3-review')||
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
    'apps/api/src/modules/rewarded-credits/composition/install-wallet-rows.ts');
  const composer=fs.existsSync(composerPath)?fs.readFileSync(composerPath,'utf8'):'';
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/rewarded-credits/composition/install-wallet-rows.js";';
  if(core.includes('@gafus/gafus-server/rewarded-wallet-rows')||
     !core.includes('requireRewardedWalletPort().withLockedRewardedWallet(')||
     !core.includes('REWARDED_MAX_CREDIT_BALANCE')||
     !core.includes('REWARDED_DAILY_LIMIT_TIMEZONE')||
     !port.includes('REWARDED_WALLET_PORT_UNBOUND')||
     !port.includes('REWARDED_WALLET_PORT_ALREADY_BOUND')||
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
     !composer.includes('registerRewardedWalletPort(rewardedWalletRows)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { offlineRoutes }')){
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
  const app=fs.readFileSync(path.join(project,'apps/api/src/app.ts'),'utf8');
  const boot='import "./modules/user/composition/install-profile-rows.js";';
  if(core.includes('@gafus/identity-write-server/profile-rows')||
    !core.includes('requireProfileRowsPort()')||
    !core.includes('parseBirthDateEditWire')||
    !core.includes('getChatDisplayRole(user, (id, at) =>')||
    !core.includes('deleteFileFromCDN(priorKey)')||
    !port.includes('PROFILE_ROWS_PORT_UNBOUND')||
    !port.includes('PROFILE_ROWS_PORT_ALREADY_BOUND')){
    violations.push('profile-sql: Core must preserve strict private/public DTO and fail-closed owner-scoped port');
  }
  if(!sql.includes('PROFILE_OWNER_MISMATCH')||
     !sql.includes('WHERE "id" = ${userId} FOR UPDATE')||
     !sql.includes('tx.userProfile.upsert')||
     !sql.includes('where: { showInProfile: true }')||
     !sql.includes('where: { provider: "vk" }')||
     !composer.includes('from "@gafus/identity-write-server/profile-rows"')||
     !composer.includes('registerProfileRowsPort(profileRows)')||
     !app.includes(boot)||app.indexOf(boot)>app.indexOf('import { offlineRoutes }')){
    violations.push('profile-sql: canonical owner SQL, avatar PG lock and API boot must be preserved');
  }
}
if (importedServerPackages.size) {
  violations.push('Unexpected server-domain dependency: '+[...importedServerPackages.keys()].join(', '));
}
if (violations.length) {
  console.error('Server domain boundary FAIL:\n'+violations.join('\n'));
  process.exit(1);
}
console.log(`Server domain boundary PASS: ${packages.length} packages, ${modules} production modules, no Core back dependencies`);
