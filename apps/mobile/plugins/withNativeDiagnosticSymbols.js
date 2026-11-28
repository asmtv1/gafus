const { withXcodeProject } = require('expo/config-plugins');
const MARK = '# GAFUS_NATIVE_DIAGNOSTIC_SYMBOLS';
function patchBundleScript(source){
  if(source.includes(MARK))return source;
  if(!source.includes('react-native-xcode.sh'))throw Error('GAFUS_NATIVE_DIAGNOSTIC_BUNDLE_SCRIPT_CHANGED');
  const prefix=`# GAFUS_NATIVE_DIAGNOSTIC_SYMBOLS
if [[ "$CONFIGURATION" != *Debug* && -n "\${GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR:-}" ]]; then
  set -e
  test -d "$GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR"
  export SOURCEMAP_FILE="$GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR/main.jsbundle.map"
fi
`;
  const suffix=`
if [[ "$CONFIGURATION" != *Debug* && -n "\${GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR:-}" ]]; then
  test "$SOURCEMAP_FILE" = "$GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR/main.jsbundle.map"
  test -s "$SOURCEMAP_FILE"
  chmod 600 "$SOURCEMAP_FILE"
  GAFUS_BUNDLE="$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"
  test -s "$GAFUS_BUNDLE"
  BUNDLE_SHA=$(/usr/bin/shasum -a 256 "$GAFUS_BUNDLE" | /usr/bin/awk '{print $1}')
  MAP_SHA=$(/usr/bin/shasum -a 256 "$SOURCEMAP_FILE" | /usr/bin/awk '{print $1}')
  printf '{"bundleSha256":"%s","mapSha256":"%s"}\\n' "$BUNDLE_SHA" "$MAP_SHA" > "$GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR/bundle-proof.json"
  chmod 600 "$GAFUS_NATIVE_DIAGNOSTICS_CAPTURE_DIR/bundle-proof.json"
fi
`;
  return prefix+source+suffix;
}
module.exports=function withNativeDiagnosticSymbols(config){
  return withXcodeProject(config,mod=>{
    const phases=mod.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    const matches=Object.values(phases).filter(p=>typeof p?.shellScript==='string'&&p.shellScript.includes('react-native-xcode.sh'));
    if(matches.length!==1)throw Error('GAFUS_NATIVE_DIAGNOSTIC_BUNDLE_PHASE_REQUIRED');
    const phase=matches[0];
    const source=JSON.parse(phase.shellScript);
    phase.shellScript=JSON.stringify(patchBundleScript(source));
    return mod;
  });
};
module.exports.patchBundleScript=patchBundleScript;
