import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const patch = readFileSync(
  new URL("../../../../../patches/expo-widgets@55.0.20.patch", import.meta.url),
  "utf8",
);
const source = readFileSync(new URL("./widgets/DogWalk.ios.tsx", import.meta.url), "utf8");

describe("iOS widget App Intent delivery contract", () => {
  it("uses real WidgetKit buttons rather than opening the React screen", () => {
    for (const action of ["start", "pause", "finish"])
      expect(source).toContain(`target="walk:${action}"`);
    expect(source).not.toContain("<Link");
    expect(source).not.toContain("gafus://walk?action=");
  });
  it("targets the host app process and persists separate atomic commands to an App Group", () => {
    expect(patch).toContain("struct WidgetUserInteraction: AppIntent");
    expect(patch).not.toContain("extension WidgetUserInteraction: ForegroundContinuableIntent");
    expect(patch).toContain("static var supportedModes: IntentModes { .foreground(.dynamic) }");
    expect(patch).toContain("@available(iOS 26.0, *)");
    expect(patch).toContain("group.ru.gafus.app");
    expect(patch).toContain("walk-widget-commands-v1");
    expect(patch).toContain("options: .atomic");
    expect(patch).toContain("pendingDogWalkCommands");
    expect(patch).toContain("ackDogWalkCommand");
  });
});
