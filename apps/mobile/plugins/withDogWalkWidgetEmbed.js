const { withXcodeProject } = require('expo/config-plugins');

/**
 * Expo SDK 55 expo-widgets may generate an extension target and dependency but
 * leave the PBXCopyFilesBuildPhase empty. That produces BUILD SUCCEEDED while
 * the widget is absent from the installed .app. Repair the embedding, not the
 * target itself, after the stock expo-widgets config plugin has run.
 */
function ensureDogWalkWidgetEmbedded(project) {
  const objects = project.hash.project.objects;
  const nativeTargets = objects.PBXNativeTarget ?? {};
  const main = project.getFirstTarget();
  if (!main?.uuid || !nativeTargets[main.uuid]) {
    throw new Error('GAFUS: missing app target for widget extension embedding');
  }
  const target = Object.values(nativeTargets).find(t =>
    t && typeof t === 'object' && t.name === 'ExpoWidgetsTarget');
  if (!target?.productReference) {
    throw new Error('GAFUS: expo-widgets did not generate ExpoWidgetsTarget');
  }
  const productRef = target.productReference;
  const reference = objects.PBXFileReference?.[productRef];
  if (!reference || !String(reference.path).includes('ExpoWidgetsTarget.appex')) {
    throw new Error('GAFUS: widget extension product reference is invalid');
  }
  const buildFiles = objects.PBXBuildFile ?? (objects.PBXBuildFile = {});
  const phases = objects.PBXCopyFilesBuildPhase ?? {};
  const appPhases = main.firstTarget.buildPhases;
  const copyRef = appPhases.find(ref => phases[ref.value]?.dstSubfolderSpec === 13);
  const copy = copyRef && phases[copyRef.value];
  if (!copy) throw new Error('GAFUS: no PlugIns (dstSubfolderSpec=13) copy phase in app target');
  let changed = false;
  if (!copy.files.some(file => buildFiles[file.value]?.fileRef === productRef)) {
    const uuid = project.generateUuid();
    const name = 'ExpoWidgetsTarget.appex in Embed Foundation Extensions';
    buildFiles[uuid] = {
      isa: 'PBXBuildFile',
      fileRef: productRef,
      fileRef_comment: 'ExpoWidgetsTarget.appex',
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy', 'CodeSignOnCopy'] },
    };
    buildFiles[`${uuid}_comment`] = name;
    copy.files.push({ value: uuid, comment: name });
    changed = true;
  }

  // The default Expo 55 extension phase is placed after an AppTracer dSYM
  // script. This causes an Xcode new-build-system cycle:
  // copy .appex -> AppTracer dSYM -> Info.plist -> copy .appex.
  // Embed after app Resources, before Bundle scripts and dSYM generation.
  const resources = objects.PBXResourcesBuildPhase ?? {};
  const resourcesRef = appPhases.find(ref => resources[ref.value]);
  const before = appPhases.indexOf(copyRef);
  const resourcesIndex = appPhases.indexOf(resourcesRef);
  if (resourcesIndex < 0) throw new Error('GAFUS: no app Resources phase for WidgetKit order');
  if (before !== resourcesIndex + 1) {
    appPhases.splice(before, 1);
    const targetIndex = appPhases.indexOf(resourcesRef);
    appPhases.splice(targetIndex + 1, 0, copyRef);
    changed = true;
  }
  return changed;
}

module.exports = function withDogWalkWidgetEmbed(config) {
  return withXcodeProject(config, mod => {
    ensureDogWalkWidgetEmbedded(mod.modResults);
    return mod;
  });
};
module.exports.ensureDogWalkWidgetEmbedded = ensureDogWalkWidgetEmbedded;
