// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailAlertBadge } from "./MailAlertBadge";

const fake = vi.hoisted(() => ({ requestAdmin: vi.fn() }));
vi.mock("./api", () => ({ requestAdmin: fake.requestAdmin }));
const admin = { id: "admin1", role: "ADMIN" as const, username: "chief" };
const moderator = { id: "mod1", role: "MODERATOR" as const, username: "mod" };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fake.requestAdmin.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ADMIN-1 sidebar Next mail alert parity", () => {
  it("shows a valid admin-only count from the existing Hono endpoint", async () => {
    fake.requestAdmin.mockResolvedValueOnce({ count: 12 });
    await act(async () => root.render(<MailAlertBadge actor={admin} />));
    expect(fake.requestAdmin).toHaveBeenCalledTimes(1);
    expect(fake.requestAdmin.mock.calls[0]?.[0]).toBe("/api/v1/admin/mail/alerts");
    expect(host.textContent).toContain("12");
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label"))
      .toBe("Почтовых проблем: 12");
  });

  it("never requests privileged mail data under MODERATOR", async () => {
    await act(async () => root.render(<MailAlertBadge actor={moderator} />));
    expect(fake.requestAdmin).not.toHaveBeenCalled();
    expect(host.textContent).toBe("");
  });

  it("bounds 100+ incidents and rejects nonsensical counts", async () => {
    fake.requestAdmin.mockResolvedValueOnce({ count: 120 });
    await act(async () => root.render(<MailAlertBadge actor={admin} />));
    expect(host.textContent).toBe("99+");
    await act(async () => root.render(<MailAlertBadge actor={moderator} />));
    expect(host.textContent).toBe("");
    fake.requestAdmin.mockResolvedValueOnce({ count: -1 });
    await act(async () => root.render(<MailAlertBadge actor={admin} />));
    expect(host.textContent).toBe("");
    expect(fake.requestAdmin).toHaveBeenCalledTimes(2);
  });
});
