// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileIntroPanel, type MobileDateFilter } from "./MobileIntroPanel";

let root: ReturnType<typeof createRoot>;
let host: HTMLElement;
const report = {
  timeZone: "Europe/Samara", range: { start: "2026-10-01", end: "2026-10-25" },
  generatedAt: "2026-10-25T10:00:00.000Z", openings: 12, completed: 8,
  skipped: 4, registered: 5, loggedIn: 1, pendingAuth: 6,
};
const fallback: MobileDateFilter = { startDate: "2026-10-01", endDate: "2026-10-25" };
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});

describe("Vite mobile intro period query parity", () => {
  it("restores shareable Next query period and notifies the report fetcher", async () => {
    window.history.replaceState(null, "", "/main-panel/mobile-intro?start=2026-10-03&end=2026-10-15");
    const apply = vi.fn();
    await act(async () => root.render(
      <MobileIntroPanel data={report} range={fallback} onApply={apply} />,
    ));
    expect(apply).toHaveBeenCalledWith({ startDate: "2026-10-03", endDate: "2026-10-15" });
    const inputs = host.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(inputs[0]?.value).toBe("2026-10-03");
    expect(inputs[1]?.value).toBe("2026-10-15");
  });
  it("shows the historical Next empty cohort state without a broken progress bar", async () => {
    window.history.replaceState(null, "", "/main-panel/mobile-intro?start=2026-10-01&end=2026-10-25");
    const zero = Object.fromEntries(
      ["openings", "completed", "skipped", "registered", "loggedIn", "pendingAuth"]
        .map((field) => [field, 0]),
    );
    await act(async () => root.render(
      <MobileIntroPanel data={{ ...report, ...zero }} range={fallback} onApply={vi.fn()} />,
    ));
    expect(host.querySelector('[role="status"]')?.textContent).toContain("нет установок");
    expect(host.querySelectorAll('[role="progressbar"]').length).toBe(6);
    expect(host.textContent).toContain("Завершение и пропуск");
  });
  it("ignores unrelated query fields and preserves existing report without mutation", async () => {
    window.history.replaceState(null, "", "/main-panel/mobile-intro?start=2026-10-01&end=2026-10-25&unused=1");
    const apply = vi.fn();
    await act(async () => root.render(
      <MobileIntroPanel data={report} range={fallback} onApply={apply} />,
    ));
    expect(apply).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Воронка регистрации и входа");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
