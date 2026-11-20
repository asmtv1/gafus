import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/error-reporting", () => ({ reportClientError: vi.fn() }));

import { redirectSystemPath } from "../../../../app/+native-intent";

const redirect = (path: string) => redirectSystemPath({ path, initial: true });

describe("native links cannot restart retired VK authorization", () => {
  it.each([
    "vk54804685://vk.ru/blank.html?code=ok&state=abc",
    "vk123://vk.ru?payload=android",
    "vk123://vk.ru/blank.html#complete",
    "VK123://VK.RU/blank.html?code=ok",
   ])("does not special-case unsupported VK callback: %s", (path) => {
    expect(redirect(path)).toBe(path);
  });

  it.each([
    "/feed/post-1?commentId=vk.ru",
    "/questions/question-1?source=vk.ru",
    "https://vk.ru/blank.html",
    "vk123://fakevk.ru/blank.html",
    "vk123://vk.ru.evil.test/blank.html",
    "vkabc://vk.ru/blank.html",
    "vk123://vk.ru/unrelated/path?code=abc",
    "gafus:///feed/post-1?returnTo=vk.ru",
  ])("preserves unrelated or spoofed deep link: %s", (path) => {
    expect(redirect(path)).toBe(path);
  });

  it("preserves ordinary app routing when the VK marker is absent", () => {
    expect(redirect("/(main)/(tabs)/profile")).toBe("/(main)/(tabs)/profile");
    expect(redirect("/cynologist-chat")).toBe("/cynologist-chat");
  });
});


describe("verified GAFUS HTTPS native intent to mounted Expo screens", () => {
  it.each([
    ["https://gafus.ru/feed/post-A?commentId=one", "/feed/post-A?commentId=one"],
    ["https://www.gafus.ru/questions/question-A", "/questions/question-A"],
    ["https://gafus.ru/moments/post-A", "/feed/post-A"],
    ["https://gafus.ru/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789", "/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789"],
    ["https://www.gafus.ru/chats/chat-A", "/chats/chat-A"],
    ["https://gafus.ru/training/dog-basic/step-A", "/training/dog-basic/step-A"],
  ])("normalizes %s to %s",(url,expected) => {
    expect(redirect(url)).toBe(expected);
  });
  it.each([
    "https://wrong.example/feed/post-A",
    "http://gafus.ru/questions/question-A",
    "https://gafus.ru/other/unknown",
  ])("does not trust arbitrary URLs or rewrite them",value=>{
    expect(redirect(value)).toBe(value);
  });
});
