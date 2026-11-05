const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureDogWalkWidgetEmbedded } = require('./withDogWalkWidgetEmbed');

function fixture() {
  const main = { name: 'Gafus', buildPhases: [
    {value:'RES',comment:'Resources'},
    {value:'TRACE',comment:'[AppTracer] Upload dSYM'},
    { value: 'COPY', comment: 'Embed Foundation Extensions' },
  ] };
  return {
    hash: { project: { objects: {
      PBXNativeTarget: {
        MAIN: main,
        WIDGET: { name: 'ExpoWidgetsTarget', productReference: 'PRODUCT' },
      },
      PBXResourcesBuildPhase: { RES: {isa: 'PBXResourcesBuildPhase'} },
      PBXCopyFilesBuildPhase: { COPY: {
        isa: 'PBXCopyFilesBuildPhase', dstSubfolderSpec: 13, files: [],
      } },
      PBXFileReference: { PRODUCT: { path: 'ExpoWidgetsTarget.appex' } },
      PBXBuildFile: {},
    } } },
    getFirstTarget: () => ({ uuid: 'MAIN', firstTarget: main }),
    generateUuid: () => 'F8E02E6E7A72D4BB16693300',
  };
}

test('the app embeds the WidgetKit target with copy+codesign on clean prebuild', () => {
  const project = fixture();
  assert.equal(ensureDogWalkWidgetEmbedded(project), true);
  const copy = project.hash.project.objects.PBXCopyFilesBuildPhase.COPY;
  assert.equal(copy.files.length, 1);
  assert.deepEqual(project.hash.project.objects.PBXNativeTarget.MAIN.buildPhases.map(ref=>ref.value),
    ['RES','COPY','TRACE']);
  assert.equal(project.hash.project.objects.PBXBuildFile[copy.files[0].value].fileRef, 'PRODUCT');
  assert.deepEqual(project.hash.project.objects.PBXBuildFile[copy.files[0].value].settings.ATTRIBUTES,
    ['RemoveHeadersOnCopy','CodeSignOnCopy']);
  assert.equal(ensureDogWalkWidgetEmbedded(project), false);
  assert.equal(copy.files.length, 1);
});

test('does not silently pass when Expo has not generated a widget target', () => {
  const project = fixture();
  delete project.hash.project.objects.PBXNativeTarget.WIDGET;
  assert.throws(() => ensureDogWalkWidgetEmbedded(project), /did not generate/);
});

test('rejects missing app PlugIns destination', () => {
  const project = fixture();
  project.hash.project.objects.PBXCopyFilesBuildPhase.COPY.dstSubfolderSpec = 10;
  assert.throws(() => ensureDogWalkWidgetEmbedded(project), /PlugIns/);
});
