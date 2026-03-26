import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isMailerConfigured, mailerEnvFromProcess } from "./env.js";

describe("isMailerConfigured", () => {
  it("false без хоста или без MAIL_FROM", () => {
    expect(
      isMailerConfigured({
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        mailFrom: "a@b.ru",
      }),
    ).toBe(false);
    expect(
      isMailerConfigured({
        smtpHost: "postfix",
        smtpPort: 587,
        smtpSecure: false,
        mailFrom: "",
      }),
    ).toBe(false);
  });

  it("true при хосте и mailFrom", () => {
    expect(
      isMailerConfigured({
        smtpHost: "postfix",
        smtpPort: 587,
        smtpSecure: false,
        mailFrom: "noreply@gafus.ru",
      }),
    ).toBe(true);
  });
});

describe("mailerEnvFromProcess", () => {
  const keys = ["SMTP_HOST", "MAIL_FROM", "SMTP_PORT"] as const;
  const backup: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of keys) backup[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      const v = backup[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("подставляет порт 587 по умолчанию", () => {
    process.env.SMTP_HOST = "h";
    process.env.MAIL_FROM = "x@y.ru";
    delete process.env.SMTP_PORT;
    expect(mailerEnvFromProcess().smtpPort).toBe(587);
  });
});
