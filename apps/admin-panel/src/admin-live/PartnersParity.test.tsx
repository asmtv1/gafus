import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatPartnerDate, PartnersPanel } from "./PartnersPanel";

const one = {
  id: "partner-one", username: "partner", email: "creator@example.test",
  fullName: "Автор", referralCode: "CREATOR", referrals: 3,
  availableRub: 100.5, earnedRub: 300, reservedRub: 199.5,
  availableKopecks: 10050, isActive: true,
};

const props = { initialPartnerId: null, onSaved: vi.fn(), onNavigate: vi.fn() };

describe("admin partners Next display parity", () => {
  it("shows payment date including time, unlike the old date-only Vite rendering", () => {
    const actual = formatPartnerDate("2026-10-25T10:27:00Z");
    expect(actual).toMatch(/25\.10\.2026/);
    expect(actual).toMatch(/\d{1,2}:27/);
    expect(formatPartnerDate("nonsense")).toBe("—");
  });
  it("shows active/inactive chips from the real partner report, without fake values", () => {
    const html = renderToStaticMarkup(createElement(PartnersPanel, {
      ...props, source: [one, { ...one, id: "partner-two", isActive: false }],
    }));
    expect(html).toContain("status-pill active");
    expect(html).toContain("Выключен");
    expect(html).toContain("CREATOR");
    expect(html).toContain("100,50");
  });
});
