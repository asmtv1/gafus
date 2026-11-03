const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const pluginPath = require.resolve('./withAppTracerNative');
const { patchIosTracerPodfile: patch } = require(pluginPath);
const base = "source 'https://cdn.cocoapods.org/'\ntarget 'Gafus' do\n  use_expo_modules!\nend\n";
const pinned = "pod 'OKTracer', '1.5.2'";

test('pins iOS 1.5.2 in a fresh Podfile', () => assert.ok(patch(base).includes(pinned)));
for (const version of ['1.4.0', '1.4.1', '1.5.2']) {
  test(`updates existing iOS ${version} without duplicate declarations`, () => {
    const result = patch(base.replace('  use_expo_modules!', `  pod 'OKTracer', '${version}'\n  use_expo_modules!`));
    assert.equal(result.match(/pod 'OKTracer'/g).length, 1);
    assert.ok(result.includes(pinned));
  });
}
test('updates double quoted declarations', () => assert.ok(patch('target "Gafus" do\n  pod "OKTracer", "1.4.0"\nend\n').includes(pinned)));
test('replaces an unversioned pod', () => assert.ok(patch("target 'Gafus' do\n  pod 'OKTracer'\nend\n").includes(pinned)));
test('keeps existing pod sources and other dependencies', () => {
  const input = base.replace('  use_expo_modules!', "  pod 'OtherPod', '2.0.0'\n  use_expo_modules!");
  assert.ok(patch(input).includes(input.replace("target 'Gafus' do\n", `target 'Gafus' do\n  ${pinned}\n`)));
});
test('is idempotent', () => assert.equal(patch(patch(base)), patch(base)));
test('recognizes an existing double quoted Tracer source', () => {
  const result = patch('source "https://github.com/odnoklassniki/tracer-ios.git"\n' + base);
  assert.equal(result.match(/tracer-ios\.git/g).length, 1);
});
test('supports CRLF and indented targets', () => assert.ok(patch("  target 'Gafus' do\r\n  end\r\n").includes(`\r\n    ${pinned}\n`)));
test('fails clearly when a fresh Podfile has no target', () => assert.throws(() => patch('use_expo_modules!\n'), /Cannot locate iOS target/));
test('plugin applies iOS patch while Android plugin and runtime remain 1.4.0', () => {
  const callbacks = {};
  const names = ['withAppBuildGradle', 'withAppDelegate', 'withInfoPlist', 'withMainApplication', 'withPodfile', 'withSettingsGradle', 'withXcodeProject'];
  const mocks = Object.fromEntries(names.map(name => [name, (config, callback) => { callbacks[name] = callback; return config; }]));
  const sandbox = {
    module: { exports: {} },
    require: name => { assert.equal(name, 'expo/config-plugins'); return mocks; },
    process: { env: { EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID: 'test', TRACER_PLUGIN_TOKEN_ANDROID: 'test', EXPO_PUBLIC_TRACER_APP_TOKEN_IOS: 'test' } },
  };
  vm.runInNewContext(fs.readFileSync(pluginPath, 'utf8'), sandbox);
  sandbox.module.exports({});
  const ios = callbacks.withPodfile({ modResults: { contents: base.replace('  use_expo_modules!', "  pod 'OKTracer', '1.4.0'\n  use_expo_modules!") } });
  assert.ok(ios.modResults.contents.includes(pinned));
  const android = callbacks.withAppBuildGradle({ modResults: { contents: 'android {\n}\ndependencies {\n}\n' } });
  assert.match(android.modResults.contents, /id "ru.ok.tracer" version "1\.4\.0"/);
  assert.match(android.modResults.contents, /tracer-platform:1\.4\.0/);
});
