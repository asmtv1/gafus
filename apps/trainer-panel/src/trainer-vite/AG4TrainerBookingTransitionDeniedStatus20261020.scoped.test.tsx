// @vitest-environment jsdom
/** AG4 synthetic Vite booking mutation negative-response characterization; no real network. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrainerBookingTransitionAction, type TrainerBookingRecord } from "./TrainerBookingTransitionAction";
import type { PanelActor } from "./consultationContract";

type Mode = "confirm" | "complete" | "noShow" | "reject";
const trainer: PanelActor = { id: "trainer-a", role: "TRAINER" };
const principal = { actor: trainer, token: "SYNTHETIC_TOKEN", authEpoch: "generation-a" };
const scenarios: [Mode, string, string, string][] = [
  ["confirm", "PENDING_TRAINER_CONFIRMATION", "Подтвердить", "Да, подтвердить"],
  ["complete", "CONFIRMED", "Завершить", "Да, завершить"],
  ["noShow", "CONFIRMED", "Отметить неявку", "Да, отметить неявку"],
  ["reject", "PENDING_TRAINER_CONFIRMATION", "Отклонить заявку", "Да, отклонить"],
];
const route: Record<Mode, string> = {
  confirm: "confirm", complete: "complete", noShow: "no-show", reject: "reject",
};
const deny = (status: number) => new Response(JSON.stringify({
  success: false, error: "SYNTHETIC_DENIAL",
}), { status, headers: { "cache-control": "private, no-store" } });
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const booking = (status: string, owner = trainer.id): TrainerBookingRecord => ({
  id: "booking-a", status, cynologistUserId: owner,
  slot: { id: "slot-a", startAtUtc: "2026-10-20T09:00:00Z",
    endAtUtc: "2026-10-20T09:30:00Z", status: "BOOKED" },
});
async function mount(mode: Mode, status: string, fetchImpl: typeof fetch,
  actor: PanelActor = trainer, owner = trainer.id, refreshed = vi.fn()) {
  await act(async () => root.render(createElement(TrainerBookingTransitionAction, {
    mode, booking: booking(status, owner), actor, token: principal.token,
    authEpoch: principal.authEpoch, getCurrentSession: () => principal,
    fetchImpl, onVerifiedRefresh: refreshed,
  })));
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")]
    .find(button => button.textContent === text);
  expect(button, `missing action ${text}`).toBeDefined();
  await act(async () => button?.click());
}
for (const [mode, state, first, approve] of scenarios) {
  for (const status of [401, 403, 404, 409]) {
    it(`${mode}: HTTP ${status} after approved POST is UNKNOWN without retry/readback`, async () => {
      const fetchImpl = vi.fn(async () => deny(status));
      const refreshed = vi.fn();
      await mount(mode, state, fetchImpl, trainer, trainer.id, refreshed);
      await click(first);
      expect(fetchImpl).not.toHaveBeenCalled();
      await click(approve);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[role="alert"]')?.textContent).toContain("неизвестен");
      expect(host.textContent).not.toContain("проверено по списку");
      expect(refreshed).not.toHaveBeenCalled();
      expect(host.querySelectorAll("button")).toHaveLength(0);
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`/api/v1/consultations/trainer/bookings/booking-a/${route[mode]}`);
      expect(init.method).toBe("POST");
      expect(init.cache).toBe("no-store");
      expect(JSON.stringify(init.headers)).toContain("Bearer SYNTHETIC_TOKEN");
    });
  }
  it(`${mode}: foreign trainer owner never reveals action or makes fetch`, async () => {
    const fetchImpl = vi.fn();
    await mount(mode, state, fetchImpl as unknown as typeof fetch, trainer, "trainer-b");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
}
