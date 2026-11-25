/** Expo inlines the revision stamp in the signed self-hosted export. */
const stamp = process.env.EXPO_PUBLIC_OTA_REVISION_STAMP;
const match = /^gafus-ota-revision:([1-9]\d*):end$/.exec(stamp ?? "");
const revision = Number(match?.[1]);
export const OTA_COMPILED_REVISION = Number.isSafeInteger(revision) ? revision : 0;
