import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  APP_SUBSCRIPTION_PLAN_CODES,
  getAppSubscriptionPlanConfig,
  isPromoEligibleAppSubscriptionPlanCode,
  normalizeAppSubscriptionPlanCode,
} from "./plans";
import { parseAppSubscriptionPromoCode, calculateAppSubscriptionPromoPrice } from "./promoCode";
import { dayStart, moneyKopecks, profitPeriod } from "./profitMath";
import { resolveAppleEnvironment } from "./appleEnvironment";
import {
  getYookassaPaymentMethodDisplayTitle,
  hashAdvisoryLockKey,
  amountsEqual,
} from "./paymentPure";

describe("shared billing and payment policies", () => {
  it("keeps historical plan IDs but does not publicly enable obsolete WEEKLY", () => {
    expect(APP_SUBSCRIPTION_PLAN_CODES).toContain("WEEKLY");
    expect(normalizeAppSubscriptionPlanCode("WEEKLY")).toBe("WEEKLY");
    expect(isPromoEligibleAppSubscriptionPlanCode("WEEKLY")).toBe(false);
    expect(isPromoEligibleAppSubscriptionPlanCode("MONTHLY")).toBe(true);
    expect(isPromoEligibleAppSubscriptionPlanCode("THREE_MONTHS")).toBe(true);
  });
  it("keeps product level independent of agreed duration and billing IDs", () => {
    expect(getAppSubscriptionPlanConfig(null, "TWO_WEEKS")).toMatchObject({ planTier: "BASIC", intervalDays: 30 });
    expect(getAppSubscriptionPlanConfig(null, "MONTHLY")).toMatchObject({ planTier: "STANDARD", intervalDays: 30 });
    expect(getAppSubscriptionPlanConfig(null, "THREE_MONTHS")).toMatchObject({ planTier: "PREMIUM", intervalDays: 30 });
    expect(getAppSubscriptionPlanConfig({ threeMonthsIntervalDays: 90 }, "THREE_MONTHS"))
      .toMatchObject({ planTier: "PREMIUM", intervalDays: 90 });
    expect(normalizeAppSubscriptionPlanCode("PREMIUM")).toBe("THREE_MONTHS");
  });
  it("retains strict promo identity and two-digit decimal rounding", () => {
    expect(parseAppSubscriptionPromoCode(" sale_20 ")).toEqual({
      code: "sale_20",
      normalizedCode: "SALE_20",
    });
    expect(parseAppSubscriptionPromoCode("value with spaces")).toBeNull();
    const price = calculateAppSubscriptionPromoPrice("999.99", 20);
    expect(price.discountedPrice.toFixed(2)).toBe("799.99");
    expect(() => calculateAppSubscriptionPromoPrice("999.99", 51)).toThrow(RangeError);
  });
  it("preserves owner-independent Apple configuration rejection", () => {
    expect(resolveAppleEnvironment({})).toMatchObject({ ok: false, code: "CONFIG_APPLE_IAP" });
    expect(
      resolveAppleEnvironment({ bundleIdRaw: "com.gafus.test", useSandboxRaw: "true" }),
    ).toMatchObject({ ok: true, bundleId: "com.gafus.test" });
  });
  it("retains financial arithmetic, Samara timezone and payment-method privacy", () => {
    expect(dayStart("2026-09-01").toISOString()).toBe("2026-08-31T20:00:00.000Z");
    expect(() => dayStart("2026-02-31")).toThrow("Некорректная дата");
    expect(moneyKopecks("12.50")).toBe(1250);
    expect(
      profitPeriod("2026-09-01", "2026-09-03", new Date("2026-09-04T12:00:00+04:00")),
    ).toMatchObject({ from: expect.anything() });
    expect(getYookassaPaymentMethodDisplayTitle({ type: "sbp" })).toBe("СБП");
    expect(getYookassaPaymentMethodDisplayTitle({ last4: "1234" })).toBe("Карта *1234");
    expect(amountsEqual("12.000", "12.0001")).toBe(true);
    expect(hashAdvisoryLockKey("subscription:user")).toBe(hashAdvisoryLockKey("subscription:user"));
  });
  it("shared policy source cannot gain Prisma, transaction or raw environment imports", () => {
    for (const file of ["appleEnvironment", "paymentPure", "plans", "profitMath", "promoCode"]) {
      const text = readFileSync(join(import.meta.dirname, file + ".ts"), "utf8");
      const source = ts.createSourceFile(file + ".ts", text, ts.ScriptTarget.Latest, true);
      const violations: string[] = [];
      const visit = (node: ts.Node): void => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          /@gafus\/(?:prisma|.*-server)/.test(node.moduleSpecifier.text)
        ) {
          violations.push("forbidden server/ORM dependency");
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          node.expression.getText(source) === "process" &&
          node.name.text === "env"
        ) {
          violations.push("environment access");
        }
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "fetch"
        )
          violations.push("network request");
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(source, visit);
      expect(violations, file).toEqual([]);
    }
  });
});
