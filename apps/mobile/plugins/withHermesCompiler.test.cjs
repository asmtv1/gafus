const test = require('node:test');
const assert = require('node:assert/strict');
const { patchHermesCompiler } = require('./withHermesCompiler');

const legacy = 'react {\n    hermesCommand = new File(["node", "--print", "require.resolve(\'react-native/package.json\')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/sdks/hermesc/%OS-BIN%/hermesc"\n}';

test('use the compiler pinned by React Native on Expo SDK 55', () => {
  const patched = patchHermesCompiler(legacy);
  assert.match(patched, /require\.resolve\('hermes-compiler\/package\.json', \{ paths: \[require\.resolve\('react-native\/package\.json'\)\] \}\)/);
  assert.ok(!patched.includes('/sdks/hermesc/'));
  assert.ok(patched.includes('/hermesc/%OS-BIN%/hermesc'));
  assert.equal(patchHermesCompiler(patched), patched);
});

test('fails loudly when Expo changes the Gradle template', () => {
  assert.throws(() => patchHermesCompiler('react {\n}\n'), /expected Expo RN compiler path/);
});
