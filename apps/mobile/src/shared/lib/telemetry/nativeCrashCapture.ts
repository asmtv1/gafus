import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ObserveConfig } from 'expo-observe';
import { enqueueMobileTelemetryError } from './mobileTelemetryClient';

/** Expo SDK57 saves a native crash on-device and dispatches it next launch.
 * JS errors are still sent through GAFUS's own anonymous mobile queue. The
 * GAFUS OTLP ingress drops Expo's duplicate JavaScript exception records. */
export function nativeCrashCaptureOptions(input:{
  platform:string;enabled:boolean;nativeEnvironment?:string;
}):ObserveConfig {
  const active=(input.platform==='ios'||input.platform==='android') && input.enabled;
  return {
    environment:input.nativeEnvironment==='preview'?'preview':'production',
    // Installed Expo Observe 57.0.28 does NOT expose errorSampleRate; using
    // sampleRate=0 would silently discard native crashes, too. Its extra
    // startup metrics are normalized into bounded histograms by the GAFUS API;
    // native.exception logs are stored and exported independently.
    sampleRate:1,
    dispatchingEnabled:active,
    dispatchInDebug:false,
  };
}

export function startNativeCrashCapture():void {
  if(Platform.OS!=='ios'&&Platform.OS!=='android')return;
  const extra=Constants.expoConfig?.extra as {otaEnvironment?:string}|undefined;
  const options=nativeCrashCaptureOptions({
    platform:Platform.OS,
    enabled:process.env.EXPO_PUBLIC_TELEMETRY_ENABLED==='true',
    nativeEnvironment:extra?.otaEnvironment,
  });
  try {
    // Expo Go does not bundle Expo Observe's native module; its absence in a
    // debug session must not break product startup. Release build contracts
    // separately require expo-observe >=57.0.21 + the custom native endpoint.
    const {Observe}=require('expo-observe') as typeof import('expo-observe');
    Observe.configure(options);
  } catch { /* diagnostic: expected Missing native crash module uses dedicated startup event or dev warning. */
    if(__DEV__) {
      console.warn('[GAFUS] native crash capture requires a custom Expo development build');
    } else if(options.dispatchingEnabled) {
      // A stale native binary may be missing the SDK even when OTA JS has it.
      // Fail visibly through a separate anonymous, queued GAFUS diagnostic;
      // never forward the underlying native-loader error/message to Uptrace.
      void enqueueMobileTelemetryError(new Error('NativeCrashCaptureUnavailable'),{
        kind:'startup_failure',errorCode:'NATIVE_CRASH_CAPTURE_UNAVAILABLE',
      }).catch(()=>{ /* diagnostic: expected Failure of crash diagnostic transport cannot recurse. */ return undefined; });
    }
  }
}
