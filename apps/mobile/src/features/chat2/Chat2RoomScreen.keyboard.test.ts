import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");
const screen = source.slice(source.indexOf("  return (\n    <TexturedSafeAreaView"));
const composerSource = readFileSync(new URL("./Chat2RoomComposer.tsx", import.meta.url), "utf8");

describe("Chat2 mobile keyboard avoidance", () => {
  it("uses padding avoidance on both iOS and Android edge-to-edge", () => {
    expect(screen).toContain("<KeyboardAvoidingView");
    expect(screen).toMatch(/<KeyboardAvoidingView[\s\S]*?behavior="padding"/);
    expect(screen).not.toContain(
      'behavior={Platform.OS === "ios" ? "padding" : undefined}',
    );
  });

  it("resizes the message list, attachment chips, reply bar and composer together", () => {
    const opening = screen.indexOf("<KeyboardAvoidingView");
    const messages = screen.indexOf("<FlatList", opening);
    const reply = screen.indexOf("{(reply || editing) && (", messages);
    const attachments = screen.indexOf("{media.length > 0 && (", reply);
    const composer = screen.indexOf("<Chat2RoomComposer", attachments);
    const closing = screen.indexOf("</KeyboardAvoidingView>", composer);
    expect(opening >= 0 && messages > opening && reply > messages && attachments > reply && composer > attachments && closing > composer).toBe(true);
    expect(composerSource).toMatch(/<View style=\{styles.composer\}>[\s\S]*<TextInput/);
    expect(screen.slice(messages, composer)).toContain('keyboardShouldPersistTaps="handled"');
    expect(screen.slice(messages, composer)).toContain('keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}');
  });
});
