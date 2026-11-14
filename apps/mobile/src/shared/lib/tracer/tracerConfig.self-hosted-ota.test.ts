import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture=vi.hoisted(()=>({
  extra: {
    appVersion:"1.7.4",
    otaTracerVersion:"1.7.4-ota.bd13130e62ad" as string | undefined,
    tracerAppTokenIos:"ios-test-token",
    tracerAppTokenAndroid:"android-test-token",
    tracerAppTokenJs:"js-test-token",
    enableTracer:true,
  },
  platform:"ios",
}));
vi.mock("expo-constants",()=>({default:{expoConfig:{extra:fixture.extra}}}));
vi.mock("react-native",()=>({Platform:{get OS(){return fixture.platform;}}}));

import { getTracerConfig, getTracerJsConfig } from "./tracerConfig";

beforeEach(()=>{
  vi.stubGlobal("__DEV__",false);
  fixture.platform="ios";
  fixture.extra.otaTracerVersion="1.7.4-ota.bd13130e62ad";
  delete process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_IOS;
  delete process.env.EXPO_PUBLIC_TRACER_APP_TOKEN_JS;
});
describe("self-hosted OTA to AppTracer source maps",()=>{
  it("uses the signed Expo manifest OTA version for native and JS reports",()=>{
    process.env.EXPO_PUBLIC_APP_VERSION="1.7.4"; // stale native version must not override update ID
    expect(getTracerConfig()).toMatchObject({versionName:"1.7.4-ota.bd13130e62ad"});
    expect(getTracerJsConfig()).toMatchObject({appVersion:"1.7.4-ota.bd13130e62ad"});
    delete process.env.EXPO_PUBLIC_APP_VERSION;
  });
  it("keeps the existing EAS version fallback when no self-hosted update is active",()=>{
    fixture.extra.otaTracerVersion=undefined;
    delete process.env.EXPO_PUBLIC_APP_VERSION;
    expect(getTracerConfig()?.versionName).toBe("1.7.4");
    expect(getTracerJsConfig()?.appVersion).toBe("1.7.4");
  });
});
