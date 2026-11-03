// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveTrainerApp } from "./LiveTrainerApp";

const m = vi.hoisted(() => ({ dashboard: vi.fn(), page: vi.fn() }));
vi.mock("../TrainerDashboardRoute", () => ({
  TrainerDashboardRoute: (props: { actor: { role: string } }) => {
    m.dashboard(props);
    return <main data-testid="real-trainer-dashboard">Обзор панели тренера</main>;
  },
}));
vi.mock("../optInRoute", () => ({
  TrainerOptInRoute: (props: { actor: { role: string }; pathname: string }) => {
    m.page(props);
    return <main data-testid="real-trainer-route">Раздел панели тренера</main>;
  },
}));

const actor = (role: "ADMIN" | "TRAINER" | "USER") => ({
  id: "actor-123", username: "staff_user", role,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "private, no-store" },
});
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/");
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  m.dashboard.mockClear(); m.page.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});

describe("live trainer panel: server-authenticated ADMIN can open real staff routes", () => {
  it.each(["ADMIN", "TRAINER"] as const)(
    "accepts %s from /auth/me and navigates dashboard and steps without denial",
    async role => {
      const f = vi.fn(async (path: string) => {
        if (path === "/api/v1/auth/me")
          return json(200, { success: true, data: actor(role) });
        throw Error(`UNEXPECTED_REQUEST:${path}`);
      });
      await act(async () => root.render(<LiveTrainerApp fetchImpl={f as typeof fetch} />));
      expect(host.querySelector('[data-testid="real-trainer-dashboard"]')).not.toBeNull();
      expect(host.textContent).not.toContain("Нет доступа к панели тренера");
      expect(m.dashboard).toHaveBeenCalledWith(expect.objectContaining({
        actor: expect.objectContaining({ role }),
      }));
      await act(async () => {
        window.history.pushState(null, "", "/steps");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(host.querySelector('[data-testid="real-trainer-route"]')).not.toBeNull();
      expect(m.page).toHaveBeenCalledWith(expect.objectContaining({
        actor: expect.objectContaining({ role }), pathname: "/main-panel/steps",
      }));
      expect(host.textContent).not.toContain("Нет доступа к панели тренера");
    },
  );
  it("admits ADMIN after cookie login, not just from an existing session", async () => {
    const f = vi.fn(async (path: string) => {
      if (path === "/api/v1/auth/me" || path === "/api/v1/auth/refresh")
        return json(401, { success: false });
      if (path === "/api/v1/auth/login") return json(200, {
        success: true, data: { user: actor("ADMIN") },
      });
      throw Error(`UNEXPECTED_REQUEST:${path}`);
    });
    await act(async () => root.render(<LiveTrainerApp fetchImpl={f as typeof fetch} />));
    const name = host.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
    const pass = host.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(name, "admin"); name.dispatchEvent(new Event("input", { bubbles: true }));
      set.call(pass, "dummy-pass"); pass.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(host.querySelector('[data-testid="real-trainer-dashboard"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Нет доступа");
    expect(m.dashboard).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ role: "ADMIN" }),
    }));
  });
  it("keeps actual USER from seeing staff navigation or routes", async () => {
    const f = vi.fn(async (path: string) => {
      if (path === "/api/v1/auth/me")
        return json(200, { success: true, data: actor("USER") });
      throw Error(`UNEXPECTED_REQUEST:${path}`);
    });
    await act(async () => root.render(<LiveTrainerApp fetchImpl={f as typeof fetch} />));
    expect(host.textContent).toContain("Нет доступа к панели тренера");
    expect(host.querySelector('[aria-label="Разделы панели тренера"]')).toBeNull();
    expect(m.dashboard).not.toHaveBeenCalled();
    expect(m.page).not.toHaveBeenCalled();
  });
});
