import { describe, expect, it } from "vitest";
import { renderNpdReceiptEmail } from "./npd-receipt-email";

describe("NPD receipt email", () => {
  it("escapes dynamic fields in HTML and provides a plain-text URL fallback", () => {
    const result = renderNpdReceiptEmail({ serviceName: '<Premium & "90">', amountKopecks: 12345, operationAt: new Date("2026-08-28T10:00:00Z"), printUrl: "https://example.test/receipt?a=1&b=2" });
    expect(result.html).toContain("&lt;Premium &amp; &quot;90&quot;&gt;");
    expect(result.html).toContain("https://example.test/receipt?a=1&amp;b=2");
    expect(result.text).toContain("<Premium & \"90\">");
    expect(result.text).toContain("https://example.test/receipt?a=1&b=2");
    expect(result.text).toContain("123.45 ₽");
  });
});
