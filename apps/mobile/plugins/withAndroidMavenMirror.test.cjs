const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  MAVEN_MIRROR_URL,
  NETWORK_PROPERTIES,
  withMirrorAfterMavenCentral,
  withNetworkProperties,
} = require("./withAndroidMavenMirror");

const mirror = `maven { url "${MAVEN_MIRROR_URL}" }`;

test("keeps official Maven Central before mirror in root Gradle repositories", () => {
  const source = `buildscript {\n  repositories {\n    google()\n    mavenCentral()\n  }\n}\nallprojects {\n  repositories {\n    google()\n    mavenCentral()\n  }\n}\n`;
  const output = withMirrorAfterMavenCentral(source);
  assert.equal(output.split(mirror).length - 1, 2);
  assert.match(output, /google\(\)\n    mavenCentral\(\)\n    maven \{ url "https:\/\/maven-central\.storage-download\.googleapis\.com\/maven2\/" \}/);
  assert.equal(withMirrorAfterMavenCentral(output), output);
});

test("migrates an existing mirror-before-central config without duplicates", () => {
  const source = `repositories {\n  google()\n  ${mirror}\n  mavenCentral()\n}`;
  const output = withMirrorAfterMavenCentral(source);
  assert.ok(output.includes(`  mavenCentral()\n  ${mirror}`));
  assert.equal(output.split(mirror).length - 1, 1);
  assert.equal(withMirrorAfterMavenCentral(output), output);
});

test("places pluginManagement mirror after Maven Central", () => {
  const source = `pluginManagement {\n  repositories {\n    google()\n    mavenCentral()\n    gradlePluginPortal()\n  }\n}`;
  assert.ok(withMirrorAfterMavenCentral(source).includes(`    mavenCentral()\n    ${mirror}`));
});

test("refuses unexpected root Gradle repository layout", () => {
  assert.throws(() => withMirrorAfterMavenCentral("repositories { google() }"), /no mavenCentral/);
});

test("allows Expo SDK 55 settings.gradle without plugin repositories", () => {
  const source = 'pluginManagement {\n  includeBuild("../node_modules/@react-native/gradle-plugin")\n}\n';
  assert.equal(withMirrorAfterMavenCentral(source, { allowMissing: true }), source);
});

test("Gradle network properties are added once and preserve unrelated entries", () => {
  const source = [
    { type: "comment", value: "# existing" },
    { type: "property", key: "org.gradle.parallel", value: "true" },
    { type: "property", key: "systemProp.org.gradle.internal.repository.max.tentatives", value: "1" },
  ];
  const once = withNetworkProperties(source);
  assert.equal(once.find((p) => p.key === "org.gradle.parallel").value, "false");
  assert.equal(once[0].value, "# existing");
  for (const [key, value] of Object.entries(NETWORK_PROPERTIES)) {
    assert.deepEqual(once.filter((p) => p.key === key).map((p) => p.value), [value]);
  }
  assert.deepEqual(withNetworkProperties(once), once);
});

test("real AppTracer prebuild settings receives mirror after Maven Central", async () => {
  const withMirror = require("./withAndroidMavenMirror");
  const withTracer = require("./withAppTracerNative");
  const oldAppToken = process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID;
  const oldPluginToken = process.env.TRACER_PLUGIN_TOKEN_ANDROID;
  try {
    process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID = "test-app-token";
    process.env.TRACER_PLUGIN_TOKEN_ANDROID = "test-plugin-token";
    const bareSettings = 'pluginManagement {\n  includeBuild("react-native")\n}\n';
    const config = withTracer(withMirror({ name: "Gafus", slug: "gafus", mods: {} }));
    const result = await config.mods.android.settingsGradle({
      name: "Gafus", slug: "gafus", mods: config.mods,
      modResults: { contents: bareSettings, language: "groovy" },
      modRequest: { platform: "android", mod: "settingsGradle", projectRoot: "." },
    });
    const output = result.modResults.contents;
    assert.equal(output.split(mirror).length - 1, 1);
    assert.ok(output.indexOf(mirror) > output.indexOf("mavenCentral()"));
    assert.ok(output.includes("gradlePluginPortal()"));
  } finally {
    if (oldAppToken === undefined) delete process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID;
    else process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_ANDROID = oldAppToken;
    if (oldPluginToken === undefined) delete process.env.TRACER_PLUGIN_TOKEN_ANDROID;
    else process.env.TRACER_PLUGIN_TOKEN_ANDROID = oldPluginToken;
  }
});

test("Gradle plugin adds retry properties in Expo config mod", async () => {
  const withMirror = require("./withAndroidMavenMirror");
  const config = withMirror({ name: "Gafus", slug: "gafus", mods: {} });
  const result = await config.mods.android.gradleProperties({
    name: "Gafus", slug: "gafus", mods: config.mods,
    modResults: [{ type: "property", key: "org.gradle.parallel", value: "true" }],
    modRequest: { platform: "android", mod: "gradleProperties", projectRoot: "." },
  });
  for (const [key, value] of Object.entries(NETWORK_PROPERTIES)) {
    assert.ok(result.modResults.some((prop) => prop.key === key && prop.value === value));
  }
});
