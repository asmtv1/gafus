import { describe, it, expect } from "vitest";
import { chat2RoomAvatar, chat2RoomName } from "./roomPresentation";

const members = [
  { userId: "me", username: "Me", avatarUrl: "own" },
  { userId: "peer", username: "Peer", avatarUrl: "other" },
];
describe("shared Chat2 room identity", () => {
  it("uses the other participant in private rooms and the room photo in groups", () => {
    for (const kind of ["DIRECT", "CYNOLOGIST"]) {
      expect(chat2RoomAvatar({ kind, members, avatarUrl: "group" }, "me")).toBe("other");
    }
    expect(chat2RoomAvatar({ kind: "GROUP", members, avatarUrl: "group" }, "me")).toBe("group");
    expect(chat2RoomAvatar({ kind: "DIRECT", members: [members[0]], avatarUrl: "group" }, "me")).toBeNull();
    expect(chat2RoomAvatar(null, "me")).toBeNull();
  });
  it("preserves explicit names and existing platform-specific fallback copy", () => {
    expect(chat2RoomName({ kind: "DIRECT", members }, "me", "fallback")).toBe("Peer");
    expect(chat2RoomName({ kind: "CYNOLOGIST", members }, "me", "fallback")).toBe("Чат с кинологом");
    expect(chat2RoomName({ kind: "GROUP", members, name: "Named" }, "me", "fallback")).toBe("Named");
    expect(chat2RoomName({ kind: "DIRECT", members: [] }, "me", "Личный чат")).toBe("Личный чат");
    expect(chat2RoomName({ kind: "DIRECT", members: [] }, "me", "Личная переписка")).toBe("Личная переписка");
    expect(chat2RoomName({ kind: "GROUP", members: [] }, "me", "fallback")).toBe("Сообщество");
  });
});
