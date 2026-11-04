import { describe, expect, it } from "vitest";
import { chat2MemberCanRead } from "./roomPolicy";
describe("Chat2 member read gate (before DB block/course/specialist ACL)", () => {
  it("requires a real, non-banned membership", () => {
    expect(chat2MemberCanRead(null)).toBe(false);
    expect(chat2MemberCanRead(undefined)).toBe(false);
    expect(chat2MemberCanRead({ role:"BANNED", conversation:{kind:"DIRECT"}})).toBe(false);
    expect(chat2MemberCanRead({ role:"MEMBER", conversation:{kind:"DIRECT"}})).toBe(true);
  });
  it("hides voluntarily exited COMMUNITY, but not ordinary hidden GROUP", () => {
    const hiddenAt = new Date();
    expect(chat2MemberCanRead({role:"MEMBER", hiddenAt, conversation:{kind:"COMMUNITY"}})).toBe(false);
    expect(chat2MemberCanRead({role:"MEMBER", hiddenAt, conversation:{kind:"GROUP"}})).toBe(true);
  });
});
