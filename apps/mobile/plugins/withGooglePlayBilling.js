const { withProjectBuildGradle } = require("expo/config-plugins");

const marker = "// GAFUS Android OpenIAP dependency";
const rule = `
${marker}
// OpenIAP 1.3.31 fixes late and duplicate Play Billing callbacks.
allprojects {
    configurations.configureEach {
        resolutionStrategy.force("io.github.hyochan.openiap:openiap-google:1.3.31")
    }
}
`;

module.exports = function withGooglePlayBilling(config) {
  return withProjectBuildGradle(config, (project) => {
    if (project.modResults.language !== "groovy") {
      throw new Error("Expected the Expo Android Groovy build file");
    }
    if (!project.modResults.contents.includes(marker)) {
      project.modResults.contents += "\n" + rule;
    }
    return project;
  });
};
