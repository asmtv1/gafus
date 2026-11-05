const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ensureStartupWindowBackground } = require("./withStartupWindowBackground.js");

describe("Android system splash → first JS frame background", () => {
  it("keeps the post-splash AppTheme sky blue instead of black", () => {
    const resources = { style: [{ $: { name: "AppTheme" }, item: [
      { $: { name: "colorPrimary" }, _: "@color/colorPrimary" },
    ] }] };
    ensureStartupWindowBackground(resources);
    ensureStartupWindowBackground(resources);
    assert.deepEqual(resources.style[0].item.filter(
      (item) => item.$.name === "android:windowBackground",
    ), [{
      $: { name: "android:windowBackground" },
      _: "@color/splashscreen_background",
    }]);
  });
  it("overrides an existing dark app window", () => {
    const resources = { style: [{ $: { name: "AppTheme" }, item: [
      { $: { name: "android:windowBackground" }, _: "@android:color/black" },
    ] }] };
    ensureStartupWindowBackground(resources);
    assert.equal(resources.style[0].item[0]._, "@color/splashscreen_background");
  });
  it("fails closed if AppTheme is removed by SDK upgrade", () => {
    assert.throws(() => ensureStartupWindowBackground({ style: [] }), /AppTheme missing/);
  });
});
