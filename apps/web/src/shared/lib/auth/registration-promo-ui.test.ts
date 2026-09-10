import { describe, expect, it } from "vitest";

import {
  getRegistrationPromoStatusMessage,
  shouldBlockRegistrationForPromo,
} from "./registration-promo-ui";

describe("registration promo UI", () => {
  it("requires an explicit current successful preview before email registration", () => {
    expect(shouldBlockRegistrationForPromo("", "idle")).toBe(false);
    expect(shouldBlockRegistrationForPromo(" KISA ", "idle")).toBe(true);
    expect(shouldBlockRegistrationForPromo("KISA", "checking")).toBe(true);
    expect(shouldBlockRegistrationForPromo("KISA", "applied")).toBe(false);
  });

  it("does not leave a success message after the field becomes editable again", () => {
    expect(getRegistrationPromoStatusMessage("applied", "Промокод KISA применён.")).toBe(
      "Промокод KISA применён.",
    );
    expect(getRegistrationPromoStatusMessage("idle", null)).toBe(
      "Введите код и нажмите «Применить».",
    );
  });
});
