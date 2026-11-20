/**
 * Read-only classification of adb devices -l.
 * An emulator or an unclassified network target is NOT physical QA evidence.
 * Device identity alone also does not prove a signed QA binary or OTA JUnit.
 */
export function classifyAdbDevices(stdout){
  if(typeof stdout!=='string')throw Error('ADB_DEVICE_OUTPUT_NOT_TEXT');
  const devices=[],emulators=[],physical=[],unclassified=[];
  for(const line of stdout.split(/\r?\n/)){
    const match=/^([^\s]+)\s+device(?:\s+(.*))?$/.exec(line.trim());
    if(!match)continue;
    const id=match[1],metadata=match[2]||'';
    devices.push(id);
    const emulator=/^emulator-\d+$/i.test(id) ||
      /\b(?:product:(?:sdk|google_sdk)|model:(?:sdk|emulator)|device:emu)/i.test(metadata);
    if(emulator){emulators.push(id);continue;}
    // Transport-only and Wi-Fi ADB entries are not USB physical evidence.
    const usbIdentity=/^[A-Za-z0-9]{8,64}$/.test(id) &&
      /\bmodel:[A-Za-z0-9_-]+/.test(metadata) &&
      /\bdevice:[A-Za-z0-9_-]+/.test(metadata);
    if(usbIdentity)physical.push(id);
    else unclassified.push(id);
  }
  if(new Set(devices).size!==devices.length)throw Error('ADB_DUPLICATE_SERIAL');
  return {deviceIds:devices,emulatorIds:emulators,physicalDeviceIds:physical,
    unclassifiedDeviceIds:unclassified,physicalDeviceConnected:physical.length>0};
}
