const assert = require("node:assert/strict");
const { test } = require("node:test");
const { patchPodfile } = require("./withVoximplantIosPods");

const base = "target 'Gafus' do\n  config = use_native_modules!(config_command)\n  use_react_native!()\nend\n";

test("adds all three official Voximplant 3.3.0 iOS podspecs", () => {
  const result = patchPodfile(base);
  for (const name of ["VoximplantCore", "VoximplantCalls", "VoximplantWebRTC"]) {
    assert.equal(result.split(`pod '${name}'`).length - 1, 1);
    assert.match(result, new RegExp(`/3\\.3\\.0/${name}\\.podspec`));
  }
  assert.match(result, /use_react_native!\(\)/);
});

test("is idempotent on an already patched Podfile", () => {
  const result = patchPodfile(base);
  assert.equal(patchPodfile(result), result);
});

test("fails closed if Podfile layout changed", () => {
  assert.throws(() => patchPodfile("target 'Gafus' do\nend\n"), /use_native_modules/);
});
