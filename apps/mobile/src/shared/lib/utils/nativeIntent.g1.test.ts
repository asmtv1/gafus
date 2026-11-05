import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/tracer", () => ({ reportClientError: vi.fn() }));

import { redirectSystemPath } from "../../../../app/+native-intent";

const redirect = (path: string) => redirectSystemPath({ path, initial: true });

describe("AG3-NOTIF-050 native VK OAuth deep-link routing", () => {
  it.each([
    "vk54804685://vk.ru/blank.html?code=ok&state=abc",
    "vk123://vk.ru?payload=android",
    "vk123://vk.ru/blank.html#complete",
    "VK123://VK.RU/blank.html?code=ok",
  ])("routes genuine VK OAuth callback to auth welcome: %s", (path) => {
    expect(redirect(path)).toBe("/(auth)/welcome");
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
