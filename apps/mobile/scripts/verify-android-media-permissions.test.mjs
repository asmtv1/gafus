import assert from "node:assert/strict";
import { test } from "node:test";
import app from "../app.json" with { type: "json" };
import { verifyAndroidMediaPermissions } from "./verify-android-media-permissions.mjs";

const merge = names => `<manifest>${names.map(name =>
  `<uses-permission android:name="${name}"/>`).join("")}</manifest>`;
const config = app.expo.android;

test("blocks permissions contributed by expo-screen-capture, image picker and other dependencies", () => {
  for (const name of ["READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_MEDIA_VISUAL_USER_SELECTED",
    "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]) {
    const fullName = `android.permission.${name}`;
    assert(config.blockedPermissions.includes(fullName));
    assert.throws(() => verifyAndroidMediaPermissions(merge([...config.permissions, fullName])),
      new RegExp(name));
  }
});

test("accepts camera, microphone, step and location permissions and rejects loss of any", () => {
  assert.doesNotThrow(() => verifyAndroidMediaPermissions(merge(config.permissions)));
  for (const permission of config.permissions) {
    assert.throws(() => verifyAndroidMediaPermissions(merge(config.permissions.filter(p => p !== permission))),
      new RegExp(permission.split(".").pop()));
  }
});

test("rejects Android 13-only declarations and sdk-23 variants", () => {
  const extra = '<uses-permission-sdk-23 android:maxSdkVersion="33" android:name="android.permission.READ_MEDIA_IMAGES"/>';
  assert.throws(() => verifyAndroidMediaPermissions(merge(config.permissions) + extra), /READ_MEDIA_IMAGES/);
});
