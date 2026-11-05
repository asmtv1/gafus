const test = require('node:test');
const assert = require('node:assert/strict');
const { patchMainApplication } = require('./withDogWalkBackgroundSteps');

const registration = 'add(ru.gafus.app.walk.DogWalkReactPackage())';

test('registers the walk package in Expo 55 without relying on template comments', () => {
  const input = `class MainApplication {\n  val reactHost = ExpoReactHostFactory.getDefaultReactHost(\n    packageList = PackageList(this).packages.apply {\n    }\n  )\n}`;
  const output = patchMainApplication(input);
  assert.match(output, /PackageList\(this\)\.packages\.apply \{\s+add\(ru\.gafus\.app\.walk\.DogWalkReactPackage\(\)\)/);
  assert.equal(patchMainApplication(output), output);
});

test('wraps an uncustomized Expo package list safely', () => {
  const input = 'packageList = PackageList(this).packages\n';
  const output = patchMainApplication(input);
  assert.ok(output.includes('PackageList(this).packages.apply {'));
  assert.ok(output.includes(registration));
});

test('fails clearly if upstream changes the package registration structure', () => {
  assert.throws(() => patchMainApplication('class MainApplication {}'), /cannot find React package list/);
});
