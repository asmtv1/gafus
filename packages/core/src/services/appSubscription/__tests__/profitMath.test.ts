import { describe, expect, it } from "vitest";
import {
  calculateProfit,
  dayStart,
  moneyKopecks,
  npdKopecks,
  profitPeriod,
  samaraDay,
  serverExpenseKopecks,
} from "../profitMath";
import { parsePaymentFinance } from "../paymentFinanceService";

describe("profit money and periods", () => {
  it("calculates the agreed example exactly", () => {
    expect(
      calculateProfit({
        payments: 249000,
        refunds: 0,
        yookassa: 10000,
        npd: npdKopecks(249000),
        partners: 25000,
        videos: 100000,
        server: 42900,
      }),
    ).toBe(61140);
  });
  it("keeps a refund and a signed commission adjustment separate", () => {
    expect(
      calculateProfit({
        payments: 0,
        refunds: 249000,
        yookassa: 0,
        npd: -9960,
        partners: -25000,
        videos: 0,
        server: 0,
      }),
    ).toBe(-214040);
  });
  it.each(["1.001", "NaN", "-1", "", "1e3", "Infinity"])("rejects malformed money %s", (amount) => {
    expect(() => moneyKopecks(amount)).toThrow();
  });
  it("parses cents without floating point subtraction", () => {
    expect(moneyKopecks("1465.01") - moneyKopecks("1400.99")).toBe(6402);
    expect(npdKopecks(146501)).toBe(5860);
  });
  it("uses Samara boundaries including September 1", () => {
    const p = profitPeriod("2026-09-01", "2026-09-01", new Date("2026-10-05T12:00:00Z"));
    expect(p.start.toISOString()).toBe("2026-08-31T20:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-09-01T20:00:00.000Z");
    expect(samaraDay(new Date("2026-08-31T20:00:00Z"))).toBe("2026-09-01");
  });
  it.each(["2026-02-30", "2026-09-31", "invalid"])("rejects invalid day %s", (day) => {
    expect(() => dayStart(day)).toThrow();
  });
  it("rejects dates before cutoff, future and reversed periods", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(() => profitPeriod("2026-08-31", "2026-09-01", now)).toThrow();
    expect(() => profitPeriod("2026-09-01", "2026-10-06", now)).toThrow();
    expect(() => profitPeriod("2026-10-05", "2026-09-01", now)).toThrow();
  });
  it("does not accrue a future server charge and never duplicates it", () => {
    expect(
      serverExpenseKopecks(dayStart("2026-09-01"), dayStart("2026-11-01"), dayStart("2026-10-05")),
    ).toBe(42900);
    expect(
      serverExpenseKopecks(dayStart("2026-09-01"), dayStart("2026-09-18"), dayStart("2026-10-05")),
    ).toBe(0);
    expect(
      serverExpenseKopecks(dayStart("2026-09-18"), dayStart("2026-09-19"), dayStart("2026-10-05")),
    ).toBe(42900);
  });
});

describe("verified YooKassa finance", () => {
  const local = { yookassaPaymentId: "yk1", amount: "2490", currency: "RUB" };
  const provider = {
    id: "yk1",
    status: "succeeded",
    amount: { value: "2490.00", currency: "RUB" },
    income_amount: { value: "2390.00", currency: "RUB" },
    captured_at: "2026-09-01T00:00:00Z",
  };
  it.each(["bank_card", "sbp", "new_method"])("uses actual net amount for %s", (type) => {
    const data = parsePaymentFinance({ ...provider, payment_method: { type } }, local);
    expect(data.providerIncomeAmount).toBe("2390.00");
    expect(data.providerPaymentMethodType).toBe(type);
    expect(data.financeSyncedAt).toBeInstanceOf(Date);
  });
  it("does not invent zero fees if income is missing", () => {
    const data = parsePaymentFinance({ ...provider, income_amount: undefined }, local);
    expect(data).not.toHaveProperty("providerIncomeAmount");
    expect(data).not.toHaveProperty("financeSyncedAt");
  });
  it.each([
    { id: "other" },
    { status: "pending" },
    { amount: { value: "1.00", currency: "RUB" } },
    { income_amount: { value: "2490.01", currency: "RUB" } },
    { income_amount: { value: "2390", currency: "USD" } },
  ])("rejects inconsistent provider information", (change) => {
    expect(() => parsePaymentFinance({ ...provider, ...change }, local)).toThrow();
  });
});
