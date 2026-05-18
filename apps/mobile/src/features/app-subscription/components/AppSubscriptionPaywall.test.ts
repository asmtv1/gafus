import { describe, expect, it } from "vitest";

import { APP_SUBSCRIPTION_LEGAL_LINKS } from "../legal-links";

describe("AppSubscriptionPaywall legal links", () => {
  it("includes Apple EULA, public offer, and privacy policy links", () => {
    expect(APP_SUBSCRIPTION_LEGAL_LINKS.appleEula).toBe(
      "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
    );
    expect(APP_SUBSCRIPTION_LEGAL_LINKS.publicOffer).toBe("https://gafus.ru/oferta.html");
    expect(APP_SUBSCRIPTION_LEGAL_LINKS.privacyPolicy).toBe("https://gafus.ru/policy.html");
  });
});
