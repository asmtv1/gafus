const { withMainActivity, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const INSTALL = 'ru.gafus.app.startup.GafusStartupPoster.show(this)';
const RELEASE_SYSTEM_SPLASH = 'SplashScreenManager.hide()';
const PACKAGE = 'add(ru.gafus.app.startup.GafusStartupPackage())';

function patchMainActivity(source) {
  if (source.includes(INSTALL)) return source;
  const anchor = 'super.onCreate(null)';
  if (!source.includes(anchor)) throw new Error('GAFUS native startup: MainActivity onCreate changed');
  return source.replace(anchor, `${anchor}\n    ${INSTALL}\n    ${RELEASE_SYSTEM_SPLASH}`);
}

function patchMainApplication(source) {
  if (source.includes(PACKAGE)) return source;
  const re = /PackageList\(this\)\.packages(?:\.apply\s*\{)?/;
  const match = re.exec(source);
  if (!match) throw new Error('GAFUS native startup: MainApplication packages changed');
  if (match[0].includes('.apply')) return source.replace(re, `${match[0]}\n          ${PACKAGE}`);
  return source.replace(re, `${match[0]}.apply {\n          ${PACKAGE}\n        }`);
}

module.exports = function withNativeAndroidStartup(config) {
  config = withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('GAFUS startup requires Kotlin MainActivity');
    mod.modResults.contents = patchMainActivity(mod.modResults.contents);
    return mod;
  });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('GAFUS startup requires Kotlin MainApplication');
    mod.modResults.contents = patchMainApplication(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.projectRoot;
    const dest = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const javaSource = path.join(root, 'native/android-startup/src/ru/gafus/app/startup');
    const javaDest = path.join(dest, 'java/ru/gafus/app/startup');
    const drawableDest = path.join(dest, 'res/drawable-nodpi');
    fs.mkdirSync(javaDest, { recursive: true });
    fs.mkdirSync(drawableDest, { recursive: true });
    for (const file of ['GafusStartupPoster.java', 'GafusStartupPackage.java']) {
      fs.copyFileSync(path.join(javaSource, file), path.join(javaDest, file));
    }
    fs.copyFileSync(path.join(root, 'assets/images/startup-splash.png'),
      path.join(drawableDest, 'gafus_startup_poster.png'));
    return mod;
  }]);
};
module.exports.patchMainActivity = patchMainActivity;
module.exports.patchMainApplication = patchMainApplication;
