// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ArticleEmbeddedPaywall, type VerifiedSubscriptionPlan } from "./ArticleEmbeddedPaywall";

let host: HTMLDivElement, root: Root;
const plan: VerifiedSubscriptionPlan = {
  code: "MONTHLY", title: "Месячный", intervalDays: 30,
  yookassaPriceRub: 1532, currency: "RUB", enabled: true,
  offlineCourseDownloadIncluded: true,
  cynologistChatIncluded: true,
  consultationBookingIncluded: false, badge: "POPULAR",
};
async function mount(props: Parameters<typeof ArticleEmbeddedPaywall>[0]) {
  await act(async () => root.render(<ArticleEmbeddedPaywall {...props} />));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();vi.unstubAllGlobals();
});
describe("WEB3 original Next embedded subscription presentation, no payment", () => {
  it("authenticated locked article renders Premium / chooser shell, no guessed tariffs or POST", async () => {
    const fetcher = vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount({});
    expect(host.textContent).toContain("Gafus Premium");
    expect(host.textContent).toContain("Подписка, которая экономит время и деньги");
    expect(host.textContent).toContain("Выберите тариф");
    expect(host.textContent).toContain("Выберите тариф на странице подписки");
    expect(host.textContent).not.toContain("1532");
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(host.querySelector("form")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("only a validated server-priced plan renders a functioning selection; no checkout", async () => {
    const fetcher = vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount({plans:[plan]});
    const radio = host.querySelector<HTMLButtonElement>('[role="radio"]');
    expect(radio?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent?.replace(/\s/g," ")).toMatch(/1 532/);
    await act(async () => radio?.click());
    expect(radio?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Выбранный тариф");
    expect(host.textContent).toContain("Месячный · 30 дней");
    expect(host.querySelector('button[type="submit"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("selects verified MONTHLY by default and switches to verified plan only",async()=>{
    const fortnight: VerifiedSubscriptionPlan = {
      ...plan,code:"TWO_WEEKS",title:"Две недели",intervalDays:14,
      yookassaPriceRub:719,badge:"TRY",
    };
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount({plans:[fortnight,plan]});
    const radios=[...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios).toHaveLength(2);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("false");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Месячный · 30 дней");
    await act(async()=>radios[0]?.click());
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("false");
    expect(host.textContent).toContain("Две недели · 14 дней");
    expect(host.querySelector('button[type="submit"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("invalid, duplicate and negative prices must fail closed without a tariff card",async()=>{
    await mount({plans:[plan,{...plan,code:"THREE_MONTHS",
      yookassaPriceRub:-1}]});
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    await mount({plans:[plan,{...plan}]});
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    await mount({plans:[null as unknown as VerifiedSubscriptionPlan]});
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
  });
  it("locked authorized article shows no fabricated offer or login shortcut",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    await mount({});
    expect(host.textContent).toContain("Тариф не подтверждён");
    expect(host.querySelector('a[href="/login"]')).toBeNull();
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verify CTA invokes only own injected authorized GET/reload callback",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    const verify=vi.fn();await mount({onRecheck:verify});
    await act(async()=>host.querySelector<HTMLButtonElement>("button")?.click());
    expect(verify).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
