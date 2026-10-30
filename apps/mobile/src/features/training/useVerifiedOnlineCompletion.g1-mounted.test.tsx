// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { useVerifiedOnlineCompletion } from "./useVerifiedOnlineCompletion";
let el: HTMLDivElement, root: Root;
let current: ReturnType<typeof useVerifiedOnlineCompletion>;
const profileA = { id: "A" },
  anotherLoginA = { id: "A" },
  profileB = { id: "B" };
function Screen({
  profile = profileA,
  epoch = "E1",
  day = "day-1",
}: {
  profile?: object;
  epoch?: string;
  day?: string;
}) {
  current = useVerifiedOnlineCompletion(profile, epoch, day);
  return createElement("span", null, current.isConfirmed(0) ? "confirmed" : "not-confirmed");
}
async function mount(profile: object = profileA, epoch = "E1", day = "day-1") {
  await act(async () => root.render(createElement(Screen, { profile, epoch, day })));
}
describe("confirmed online step is never confused with durable offline receipt", () => {
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await mount();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    el.remove();
  });
  it("displays explicitly server-confirmed completion immediately, without local-v2 journal", async () => {
    expect(el.textContent).toBe("not-confirmed");
    await act(async () => current.markConfirmed(0));
    expect(el.textContent).toBe("confirmed");
    expect(current.isConfirmed(1)).toBe(false);
  });
  it("same owner fresh epoch and new profile session hide prior successful response", async () => {
    await act(async () => current.markConfirmed(0));
    await mount(profileA, "E2");
    expect(el.textContent).toBe("not-confirmed");
    await mount(anotherLoginA, "E1");
    expect(el.textContent).toBe("not-confirmed");
    await mount(profileB, "E1");
    expect(el.textContent).toBe("not-confirmed");
  });
  it("another day and cancelled/unconfirmed operation do not inherit completion", async () => {
    await act(async () => current.markConfirmed(0));
    await mount(profileA, "E1", "day-2");
    expect(el.textContent).toBe("not-confirmed");
    expect(current.isConfirmed(0)).toBe(false);
  });
});
