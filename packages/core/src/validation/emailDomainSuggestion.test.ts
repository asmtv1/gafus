import { describe, expect, it } from "vitest";

import { suggestRegisterEmailDomain } from "./emailDomainSuggestion";

describe("suggestRegisterEmailDomain", () => {
  it("предлагает gmail.com вместо gnail.com", () => {
    const s = suggestRegisterEmailDomain("user@gnail.com");
    expect(s?.full).toBe("user@gmail.com");
  });

  it("предлагает yandex.ru для опечатки в домене", () => {
    const s = suggestRegisterEmailDomain("a@yandx.ru");
    expect(s?.full).toBe("a@yandex.ru");
  });

  it("не возвращает подсказку для корректного gmail.com", () => {
    expect(suggestRegisterEmailDomain("x@gmail.com")).toBeNull();
  });

  it("возвращает null для строки без @", () => {
    expect(suggestRegisterEmailDomain("notanemail")).toBeNull();
  });
});
