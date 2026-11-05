import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");
const screen = source.slice(source.indexOf("  return (\n    <TexturedSafeAreaView"),
  source.indexOf("const styles = StyleSheet.create("));

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
    const composer = screen.indexOf("<View style={styles.composer}>", attachments);
    const input = screen.indexOf("<TextInput", composer);
    const closing = screen.indexOf("</KeyboardAvoidingView>", input);
    expect([messages, reply, attachments, composer, input, closing].every(i => i > opening))
      .toBe(true);
    expect(screen.slice(messages, composer)).toContain('keyboardShouldPersistTaps="handled"');
    expect(screen.slice(messages, composer)).toContain('keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}');
  });
});
