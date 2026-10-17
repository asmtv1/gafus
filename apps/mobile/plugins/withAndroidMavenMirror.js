/**
 * Prefer the canonical Maven Central endpoint over its Google Storage mirror.
 * A Google Storage TLS failure must not be the first dependency source Gradle tries.
 * Keep the mirror as a secondary repository for artifacts missing upstream.
 *
 * Gradle retry settings are best-effort internal knobs; they do not mask persistent
 * TLS/connectivity failures or substitute for network diagnostics.
 */
const { withProjectBuildGradle, withSettingsGradle, withGradleProperties } = require("expo/config-plugins");

const MAVEN_MIRROR_URL = "https://maven-central.storage-download.googleapis.com/maven2/";
const NETWORK_PROPERTIES = {
  "systemProp.org.gradle.internal.repository.max.tentatives": "5",
  "systemProp.org.gradle.internal.repository.initial.backoff": "1000",
  "systemProp.org.gradle.internal.http.connectionTimeout": "60000",
  "systemProp.org.gradle.internal.http.socketTimeout": "60000",
  // Pin JVM HTTPS downloads to TLS 1.2 while the active VPN sporadically
  // corrupts TLS 1.3 Gradle transfers (curl and serial Java downloads work).
  "systemProp.jdk.tls.client.protocols": "TLSv1.2",
  "systemProp.https.protocols": "TLSv1.2",
  // Limit parallel requests and avoid massive bursts during native EAS builds.
  "org.gradle.parallel": "false",
  "org.gradle.workers.max": "4",
};

function withMirrorAfterMavenCentral(contents, { allowMissing = false } = {}) {
  const lines = contents.split("\n").filter(
    (line) => line.trim() !== `maven { url "${MAVEN_MIRROR_URL}" }`,
  );
  const output = [];
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(\s*)mavenCentral\(\)\s*$/.exec(line);
    output.push(line);
    if (match) {
      found = true;
      const declaration = `${match[1]}maven { url "${MAVEN_MIRROR_URL}" }`;
      output.push(declaration);
    }
  }

  if (!found && !allowMissing) {
    throw new Error("Cannot configure Android Maven Central mirror: no mavenCentral() repository found");
  }
  return output.join("\n");
}

function withNetworkProperties(properties) {
  const existing = properties.filter(
    (property) => property.type !== "property" || !(property.key in NETWORK_PROPERTIES),
  );
  return [
    ...existing,
    ...Object.entries(NETWORK_PROPERTIES).map(([key, value]) => ({ type: "property", key, value })),
  ];
}

function withAndroidMavenMirror(config) {
  config = withSettingsGradle(config, (mod) => {
    // Expo SDK 55 normally has no repositories in settings.gradle. AppTracer may add them.
    mod.modResults.contents = withMirrorAfterMavenCentral(mod.modResults.contents, { allowMissing: true });
    return mod;
  });
  config = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = withMirrorAfterMavenCentral(mod.modResults.contents);
    return mod;
  });
  return withGradleProperties(config, (mod) => {
    mod.modResults = withNetworkProperties(mod.modResults);
    return mod;
  });
}

module.exports = withAndroidMavenMirror;
module.exports.MAVEN_MIRROR_URL = MAVEN_MIRROR_URL;
module.exports.NETWORK_PROPERTIES = NETWORK_PROPERTIES;
module.exports.withMirrorAfterMavenCentral = withMirrorAfterMavenCentral;
module.exports.withNetworkProperties = withNetworkProperties;
