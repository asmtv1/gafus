import { describe, expect, it } from "vitest";
import {
  registrationChannelRequestSchema,
  resolveRegistrationChannelFromBody,
} from "./authRegisterSchema";

describe("registration source boundary shared with the browser and native clients", () => {
  it.each(["WEB", "IOS", "ANDROID"] as const)(
    "retains the explicitly declared %s registration channel", (source) => {
      expect(registrationChannelRequestSchema.safeParse(source).success).toBe(true);
      expect(resolveRegistrationChannelFromBody(source)).toBe(source);
    },
  );

  it("marks an absent channel as UNKNOWN rather than defaulting to WEB", () => {
    expect(resolveRegistrationChannelFromBody(undefined)).toBe("UNKNOWN");
  });

  it.each(["UNKNOWN", "VK", "GOOGLE", "", "WEB "] as const)(
    "rejects %s as an explicit client registration channel", (source) => {
      expect(registrationChannelRequestSchema.safeParse(source).success).toBe(false);
    },
  );
});
