import {issueOtaTesterGrant} from "@gafus/mobile-ota-server/tester-access";
import { describe, expect, it, vi } from "vitest";
import { createOtaManifestRoutes, type OtaManifestRepository } from "./manifest-protocol";

const bytes = new TextEncoder().encode(JSON.stringify({
  id: "9fd451f5-75bd-413a-92ee-4122fb93f9ba",
  createdAt: "2026-11-12T00:00:00.000Z",
  runtimeVersion: "1.7.5",
  launchAsset: { key: "bundle", contentType: "application/javascript", url: "https://cdn.test/bundle" },
  assets: [], metadata: { channel: "preview" }, extra: {},
}));
const signature = 'sig="AQIDBA==", keyid="preview-main", alg="rsa-v1_5-sha256"';
const standardHeaders = {
  "expo-protocol-version": "1",
  "expo-platform": "ios",
  "expo-runtime-version": "1.7.5",
  "expo-channel-name": "preview",
  "x-gafus-native-fingerprint": "b".repeat(64),
  "expo-extra-params": 'gafus-installation-id="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5"',
  "expo-expect-signature": 'sig, keyid="preview-main", alg="rsa-v1_5-sha256"',
  accept: "application/expo+json, application/json, multipart/mixed",
};
function harness(result: "release" | "empty" | "bad-signature" | "error" = "release") {
  const findPublishedManifest = vi.fn<OtaManifestRepository["findPublishedManifest"]>(async () => {
    if (result === "error") throw new Error("DB DOWN");
    if (result === "empty") return null;
    return {
      manifestBody: bytes,
      signatureHeader: result === "bad-signature" ? 'sig="abc", keyid="wrong", alg="rsa-v1_5-sha256"' : signature,
      updateId: "9fd451f5-75bd-413a-92ee-4122fb93f9ba",
    };
  });
  const app = createOtaManifestRoutes({ findPublishedManifest }, { appId: "gafus", environment: "preview" });
  return { findPublishedManifest, request: (headers = standardHeaders) => app.request("http://localhost/manifest", { headers }) };
}

describe("signed account-tester eligibility in the anonymous manifest protocol",()=>{
  it("only passes testerAllowed on valid short-lived account-bound HMAC token",async()=>{
    const secret="gafus-test-secret-longer-than-thirty-two-characters";
    const installation="7ba9c3db-d4b1-4cff-8d60-ce424d1706d5";
    const token=issueOtaTesterGrant({userId:"trusted-admin-id",username:"admin",installationId:installation,platform:"ios",runtimeVersion:"1.7.5",nativeFingerprint:"b".repeat(64)},secret)!;
    const read=vi.fn<OtaManifestRepository["findPublishedManifest"]>(async()=>null);
    const app=createOtaManifestRoutes({findPublishedManifest:read},{appId:"gafus",environment:"production",testerSecret:secret});
    const request=async(extra:string)=>app.request("http://localhost/manifest",{headers:{...standardHeaders,
      "expo-extra-params":`gafus-installation-id="${installation}", gafus-tester-grant="${extra}"`}});
    expect((await request(token)).status).toBe(204);
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({testerAllowed:true,installationId:installation}));
    await request(token.slice(0,-3)+"bad");
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({testerAllowed:false}));
    await app.request("http://localhost/manifest",{headers:standardHeaders});
    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({testerAllowed:false}));
  });
});
describe("signed self-hosted Expo protocol", () => {
  it("serves immutable signed bytes and matches channel/runtime/cert", async () => {
    const { request, findPublishedManifest } = harness();
    const res = await request();
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.get("expo-signature")).toBe(signature);
    expect(res.headers.get("expo-protocol-version")).toBe("1");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(findPublishedManifest).toHaveBeenCalledWith({
      appId: "gafus", environment: "preview", platform: "ios",
      runtimeVersion: "1.7.5", channel: "preview", keyId: "preview-main", nativeFingerprint: "b".repeat(64), installationId:"7ba9c3db-d4b1-4cff-8d60-ce424d1706d5",
    });
  });
  it("no update is a no-op, not an unsigned manifest", async () => {
    const res = await harness("empty").request();
    expect(res.status).toBe(204);
    expect(res.headers.get("expo-signature")).toBeNull();
  });
  it("rejects no-update for a JSON-only client rather than unsigned JSON", async () => {
    const r = await harness("empty").request({ ...standardHeaders, accept: "application/expo+json" });
    expect(r.status).toBe(406);
    await expect(r.json()).resolves.toMatchObject({ error: "NO_UPDATE_IN_JSON_FORMAT" });
  });
  it("rejects disabled environments without touching registry", async () => {
    const read = vi.fn();
    const app = createOtaManifestRoutes({ findPublishedManifest: read }, { appId: "gafus" });
    expect((await app.request("http://localhost/manifest", { headers: standardHeaders })).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    [{ "expo-platform": "windows" }, 400],
    [{ "expo-protocol-version": "0" }, 406],
    [{ "expo-runtime-version": "../../foo" }, 400],
    [{ "expo-channel-name": "production/../" }, 400],
    [{ "expo-expect-signature": "" }, 400],
    [{ "x-gafus-native-fingerprint": "" }, 400],
    [{ "x-gafus-native-fingerprint": "unknown-build" }, 400],
    [{ "expo-expect-signature": 'sig, keyid="wrong"' }, 400],
    [{ accept: "multipart/mixed" }, 406],
  ] as const)("rejects invalid headers %j", async (patch, status) => {
    const instance = harness();
    const res = await instance.request({ ...standardHeaders, ...patch });
    expect(res.status).toBe(status);
    expect(instance.findPublishedManifest).not.toHaveBeenCalled();
  });
  it("stops on mismatched persisted signer", async () => {
    const response = await harness("bad-signature").request();
    expect(response.status).toBe(503);
    expect(response.headers.get("expo-signature")).toBeNull();
  });
  it("fails closed when registry is unavailable", async () => {
    const res = await harness("error").request();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
