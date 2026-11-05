// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savedWebMp4Mode, saveWebMp4Mode, webMp4Hints } from "./videoPlaybackPolicy";
import { selectMp4Quality } from "@gafus/chat-media-quality";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, "connection");
});

describe("Web shared MP4 selection", () => {
  it("keeps the explicit 720p/360p choice across player mounts and supports returning to Auto", () => {
    expect(savedWebMp4Mode()).toBe("auto");
    saveWebMp4Mode(720);
    expect(savedWebMp4Mode()).toBe(720);
    saveWebMp4Mode(360);
    expect(savedWebMp4Mode()).toBe(360);
    saveWebMp4Mode("auto");
    expect(savedWebMp4Mode()).toBe("auto");
  });
  it("recovers from invalid stored data, without inventing a quality", () => {
    window.localStorage.setItem("gafus:mp4-quality-mode:v1", '"1080"');
    expect(savedWebMp4Mode()).toBe("auto");
    window.localStorage.setItem("gafus:mp4-quality-mode:v1", "{invalid");
    expect(savedWebMp4Mode()).toBe("auto");
  });
  it("prefers 720 on a good connection and 360 when data saving is requested", () => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: {
      effectiveType: "4g", downlink: 7, saveData: false, type: "wifi",
    } });
    expect(selectMp4Quality("auto", webMp4Hints(220))).toBe(720);
    expect(selectMp4Quality("auto", webMp4Hints(220, true))).toBe(360);
  });
});
