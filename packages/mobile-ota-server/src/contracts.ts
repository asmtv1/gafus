/** Shared native-verified OTA lookup contracts. */
export type OtaPlatform = "ios" | "android";
export type OtaLookup = Readonly<{
  appId: string;
  environment: "preview" | "production";
  platform: OtaPlatform;
  channel: string;
  runtimeVersion: string;
  keyId: string;
  nativeFingerprint: string;
  installationId?: string | null;
}>;
export type OtaManifestRow = Readonly<{
  manifestBody: Uint8Array;
  signatureHeader: string;
  updateId: string;
}>;
export type OtaManifestRepository = {
  findPublishedManifest(key: OtaLookup): Promise<OtaManifestRow | null>;
};
