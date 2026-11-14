const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchMainActivity, patchMainApplication } = require('./withNativeAndroidStartup');

const project = path.resolve(__dirname, '..');

describe('native Android full-screen startup poster', () => {
  it('installs once after ReactActivity initialization', () => {
    const original = 'class MainActivity {\n  fun onCreate() {\n    super.onCreate(null)\n  }\n}';
    const patched = patchMainActivity(original);
    assert.match(patched, /super\.onCreate\(null\)\n\s+ru\.gafus\.app\.startup\.GafusStartupPoster\.show\(this\)/);
    assert.match(patched, /GafusStartupPoster\.show\(this\)\n\s+SplashScreenManager\.hide\(\)/);
    assert.equal(patchMainActivity(patched), patched);
    assert.throws(() => patchMainActivity('unknown template'), /MainActivity onCreate changed/);
  });
  it('registers React bridge in either Expo-generated application shape', () => {
    for (const source of ['PackageList(this).packages', 'PackageList(this).packages.apply {\n }']) {
      const patched = patchMainApplication(source);
      assert.match(patched, /add\(ru\.gafus\.app\.startup\.GafusStartupPackage\(\)\)/);
      assert.equal(patchMainApplication(patched), patched);
    }
    assert.throws(() => patchMainApplication('other'), /MainApplication packages changed/);
  });
  it('ships the poster inside APK and dismisses only after first route layout', () => {
    const app = JSON.parse(fs.readFileSync(path.join(project, 'app.json'), 'utf8'));
    assert.ok(app.expo.plugins.includes('./plugins/withNativeAndroidStartup'));
    const poster = fs.readFileSync(path.join(project, 'native/android-startup/src/ru/gafus/app/startup/GafusStartupPoster.java'), 'utf8');
    const module = fs.readFileSync(path.join(project, 'native/android-startup/src/ru/gafus/app/startup/GafusStartupPackage.java'), 'utf8');
    const layout = fs.readFileSync(path.join(project, 'app/_layout.tsx'), 'utf8');
    assert.match(poster, /ImageView\.ScaleType\.CENTER_CROP/);
    assert.match(poster, /R\.drawable\.gafus_startup_poster/);
    assert.match(module, /@ReactMethod\s+public void hide/);
    assert.match(layout, /if \(!appContentLaidOut \|\| authLoading/);
    assert.match(layout, /NativeModules\.GafusStartupPoster\?\.hide\(\)/);
    assert.match(layout, /\.finally\(\(\) =>/);
    assert.ok(fs.statSync(path.join(project, 'assets/images/startup-splash.png')).size > 100000);
  });
});
