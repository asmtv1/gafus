import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Chat2RoomScreen.tsx", import.meta.url), "utf8");

describe("Native Chat2 room header visual separation", () => {
  it("uses its own sage background, clear lower edge and elevated shadow", () => {
    const styles = source.slice(source.indexOf("const styles = StyleSheet.create({"));
    const header = styles.slice(
      styles.indexOf("  header: {"),
      styles.indexOf("  back:", styles.indexOf("  header: {")),
    );
    expect(header).toContain('backgroundColor: "#e6eee0"');
    expect(header).toContain("borderBottomWidth: 2");
    expect(header).toContain('borderColor: "#a6b991"');
    expect(header).toContain("shadowOpacity: 0.13");
    expect(header).toContain("elevation: 3");
    expect(styles).toContain('title: { color: "#263a21"');
    expect(styles).toContain('subtitle: { color: "#496142"');
  });
});

describe("Native Chat2 sender avatar rendering", () => {
  it("binds group-message portraits to the message author and the room members", () => {
    expect(source).toContain(
      "<Chat2MessageAuthorAvatar room={room} authorId={item.authorId}>",
    );
    expect(source).toContain(
      "import { Chat2Avatar, Chat2MessageAuthorAvatar } from \"./Chat2Avatar\"",
    );
    expect(source).toContain("<Text>👤</Text>");
  });
});

describe("Native Chat2 Telegram-like message actions", () => {
  it("opens actions on tap or long press, and replies via horizontal swipe", () => {
    expect(source).toContain("onPress={() => {");
    expect(source).toContain("onLongPress={() => showActions(item)}");
    expect(source).toContain("onTouchStart={(event) => {");
    expect(source).toContain("onTouchEnd={(event) => {");
    expect(source).toContain("if (dx > 70 && Math.abs(dy) < 45)");
    expect(source).toContain("swipeReplyId.current = item.id");
    expect(source).toContain("replyTo(item)");
  });
  it("renders a quick-reaction sheet and counts for each message", () => {
    expect(source).toContain('accessibilityLabel="Ответить на сообщение"');
    expect(source).toContain('animationType="fade"');
    expect(source).toContain('CHAT2_EMOJIS.map((emoji) =>');
    expect(source).toContain("item.reactions?.map((reaction) =>");
    expect(source).toContain("event.stopPropagation()");
  });
});
