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
  const legacy = fs.readFileSync(path.join(project,'packages/core/src/services',facades[name],'index.ts'),'utf8');
  if (name === "tracking-server") {
    const moduleFacade = fs.readFileSync(path.join(project, "packages/core/src/services/tracking/trackingService.ts"), "utf8");
    if (!moduleFacade.includes("@gafus/tracking-server/trackingService")) violations.push(`${name}: missing compatibility service export`);
  } else if (name === "feature-flags-server") {
    const moduleFacade = fs.readFileSync(path.join(project, "packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts"), "utf8");
    if (!moduleFacade.includes("@gafus/feature-flags-server/appFeatureFlagsService")) violations.push(`${name}: missing compatibility service export`);
  } else if (!legacy.includes(`export * from "@gafus/${name}"`)) {
    violations.push(`${name}: missing Core compatibility facade`);
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
