import { describe, expect, it } from "vitest";
import { mayOfferCheckoutToAudience, mayPublishCheckoutToAll } from "../src/checkout-audience";

const internal = { allowsCheckout: true, running: true, publicationAction: "TEST" as const, publishedToAll: false };
const published = { ...internal, publicationAction: "ALL" as const, publishedToAll: true };
const ios = { platform: "ios" as const, runtimeVersion: "1.7.5" };

describe("public checkout fail-closed policy", () => {
  it("requires explicit independent approval for ALL publication", () => {
    expect(mayPublishCheckoutToAll(ios, undefined)).toBe(false);
    expect(mayPublishCheckoutToAll(ios, "false")).toBe(false);
    expect(mayPublishCheckoutToAll(ios, "true")).toBe(true);
    expect(mayPublishCheckoutToAll({ platform: "ios", runtimeVersion: "1.7.6" }, "true")).toBe(false);
    expect(mayPublishCheckoutToAll({ platform: "android", runtimeVersion: "1.7.5" }, "true")).toBe(false);
  });
  it("keeps TEST independent of public approval", () => {
    expect(mayOfferCheckoutToAudience(ios, internal, undefined)).toBe(true);
    expect(mayOfferCheckoutToAudience(ios, { ...internal, running: false }, "true")).toBe(false);
    expect(mayOfferCheckoutToAudience(ios, { ...internal, allowsCheckout: false }, "true")).toBe(false);
  });
  it("requires ALL, public publication and separate API enable flag", () => {
    expect(mayOfferCheckoutToAudience(ios, published, undefined)).toBe(false);
    expect(mayOfferCheckoutToAudience(ios, published, "false")).toBe(false);
    expect(mayOfferCheckoutToAudience(ios, published, "true")).toBe(true);
    expect(mayOfferCheckoutToAudience(ios, { ...published, publicationAction: "RECOVER" }, "true")).toBe(false);
    expect(mayOfferCheckoutToAudience(ios, { ...published, publishedToAll: false }, "true")).toBe(false);
    expect(mayOfferCheckoutToAudience({ platform: "ios", runtimeVersion: "1.7.6" }, published, "true")).toBe(false);
    expect(mayOfferCheckoutToAudience({ platform: "android", runtimeVersion: "1.7.5" }, published, "true")).toBe(false);
  });
});
