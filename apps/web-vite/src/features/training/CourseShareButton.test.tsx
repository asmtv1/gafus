// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseShareButton } from "./CourseShareButton";

let host: HTMLDivElement;
let root: Root;
const copy = vi.fn();
const courseUrl = () => `${window.location.origin}/trainings/IMPULSE_CONTROL`;

beforeEach(async () => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  copy.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CourseShareButton
    courseName="Самоконтроль" courseType="IMPULSE_CONTROL"
    courseDescription="Тренировки для собак" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  host.remove();
});

async function clickShare() {
  const button = host.querySelector<HTMLButtonElement>("button");
  expect(button).not.toBeNull();
  await act(async () => { button?.click(); await Promise.resolve(); });
}

describe("Course sharing restored from Next at the end of the description", () => {
  it("copies the exact /trainings/:courseType link using the shared olive button", async () => {
    const btn = host.querySelector("button");
    expect(btn?.dataset.gafusSharedButton).toBe("primary");
    expect(btn?.textContent).toContain("Поделиться ссылкой на курс");
    await clickShare();
    expect(copy).toHaveBeenCalledExactlyOnceWith(courseUrl());
    expect(btn?.textContent).toContain("Ссылка скопирована!");
  });

  it("uses native Web Share instead of clipboard when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: copy } });
    await clickShare();
    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: "Курс: Самоконтроль",
      text: "Самоконтроль\n\nТренировки для собак\n\n",
      url: courseUrl(),
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it("respects native share cancellation without copying behind the user's back", async () => {
    const abort = Object.assign(new Error("Canceled"), { name: "AbortError" });
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(abort), clipboard: { writeText: copy },
    });
    await clickShare();
    expect(copy).not.toHaveBeenCalled();
    expect(host.querySelector("input")).toBeNull();
  });

  it("offers the exact selectable URL when the clipboard is denied", async () => {
    copy.mockRejectedValueOnce(new Error("Permission denied"));
    await clickShare();
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Ссылка на курс"]');
    expect(field?.readOnly).toBe(true);
    expect(field?.value).toBe(courseUrl());
    expect(host.textContent).toContain("Выделите ссылку");
  });
});
