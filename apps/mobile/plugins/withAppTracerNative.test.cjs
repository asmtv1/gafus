const assert = require("node:assert/strict");
const { test } = require("node:test");
const { patchIosTracerPodfile } = require("./withAppTracerNative");

const base = "source 'https://cdn.cocoapods.org/'\ntarget 'Gafus' do\n  use_expo_modules!\nend\n";
const tracerSpec = "source 'https://github.com/odnoklassniki/tracer-ios.git'";

test("injects OKTracer 1.5.2 into a fresh iOS Podfile", () => {
  const actual = patchIosTracerPodfile(base);
  assert.match(actual, /pod 'OKTracer', '1\.5\.2'/);
  assert.match(actual, /source 'https:\/\/github\.com\/odnoklassniki\/tracer-ios\.git'/);
  assert.equal(actual.split("pod 'OKTracer'").length - 1, 1);
});

test("updates a previously generated iOS Podfile and is idempotent", () => {
  const original = `${tracerSpec}\n${base.replace("  use_expo_modules!", "  pod 'OKTracer', '1.4.0'\n  use_expo_modules!")}`;
  const actual = patchIosTracerPodfile(original);
  assert.match(actual, /pod 'OKTracer', '1\.5\.2'/);
  assert.doesNotMatch(actual, /pod 'OKTracer', '1\.4\.0'/);
  assert.equal(patchIosTracerPodfile(actual), actual);
  assert.equal(actual.split(tracerSpec).length - 1, 1);
});

test("fails on an unexpected Podfile layout", () => {
  assert.throws(() => patchIosTracerPodfile("platform :ios, '15.1'\n"), /target declaration/);
});
