import { describe, expect, it } from "vitest";

import { isRegisterEmailWithValidDomain } from "./registerEmailDomain";

describe("isRegisterEmailWithValidDomain", () => {
  it("принимает типичный домен с TLD", () => {
    expect(isRegisterEmailWithValidDomain("u@example.com")).toBe(true);
  });

  it("отклоняет домен без TLD", () => {
    expect(isRegisterEmailWithValidDomain("u@localhost")).toBe(false);
  });

  it("отклоняет IP вместо домена", () => {
    expect(isRegisterEmailWithValidDomain("u@192.168.1.1")).toBe(false);
  });

  it("отклоняет пустую строку", () => {
    expect(isRegisterEmailWithValidDomain("")).toBe(false);
  });
});
