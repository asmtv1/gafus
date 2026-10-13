// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import ProfileSections from "./ProfileSections";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/profile?username=admin");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function mount(isOwner: boolean, initialView: "activity" | "questions" | "settings" | "notes" = "activity") {
  return act(async () => root.render(
    <ProfileSections
      isOwner={isOwner}
      username="admin"
      initialView={initialView}
      activity={<p>ACTIVITY_CONTENT</p>}
      questions={<p>MY_QUESTIONS_CONTENT</p>}
      settings={<p>SETTINGS_CONTENT</p>}
      notes={<p>CYNOLOGIST_NOTES_CONTENT</p>}
    />,
  ));
}

describe("profile sections", () => {
  it("separates account settings from the default profile content and preserves links", async () => {
    await mount(true);
    expect(host.textContent).toContain("ACTIVITY_CONTENT");
    expect(host.textContent).not.toContain("SETTINGS_CONTENT");
    expect(host.querySelectorAll('a[href="/profile/albums"]')).toHaveLength(0);
    expect(host.querySelectorAll('a[href="/pets"]')).toHaveLength(0);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("nav button")];
    const settings = buttons.find(button => button.textContent?.includes("Настройки"))!;
    const activity = buttons.find(button => button.textContent?.includes("публикации"))!;
    await act(async () => settings.click());
    expect(settings.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("SETTINGS_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
    expect(window.location.search).toContain("tab=settings");
    await act(async () => activity.click());
    expect(host.textContent).toContain("ACTIVITY_CONTENT");
    expect(window.location.search).not.toContain("tab=settings");
  });

  it("shows only my-questions content on the questions tab and restores the URL", async () => {
    await mount(true);
    expect(host.textContent).toContain("Мои публикации");
    const questions = [...host.querySelectorAll<HTMLButtonElement>("nav button")].find(
      (button) => button.textContent?.includes("Мои вопросы"),
    )!;
    await act(async () => questions.click());
    expect(questions.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("MY_QUESTIONS_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
    expect(window.location.search).toContain("tab=questions");
    await act(async () => {
      window.history.replaceState({}, "", "/profile?username=admin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.textContent).toContain("ACTIVITY_CONTENT");
    expect(host.textContent).not.toContain("MY_QUESTIONS_CONTENT");
  });

  it("opens the questions view from a direct link", async () => {
    await mount(true, "questions");
    expect(host.textContent).toContain("MY_QUESTIONS_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
  });

  it("restores the direct-link settings view", async () => {
    await mount(true, "settings");
    expect(host.textContent).toContain("SETTINGS_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
  });

  it("shows cynologist notes only as the fourth profile tab", async () => {
    await mount(true);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("nav button")];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "Мои публикации",
      "Мои вопросы",
      "Настройки аккаунта",
      "Заметки кинолога",
    ]);
    expect(host.textContent).not.toContain("CYNOLOGIST_NOTES_CONTENT");
    const notes = buttons[3]!;
    await act(async () => notes.click());
    expect(notes.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("#profile-notes")?.textContent).toContain("CYNOLOGIST_NOTES_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
    expect(host.textContent).not.toContain("SETTINGS_CONTENT");
    expect(host.textContent).not.toContain("MY_QUESTIONS_CONTENT");
    expect(window.location.search).toContain("tab=notes");

    await act(async () => {
      window.history.replaceState({}, "", "/profile?username=admin&tab=questions");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.textContent).toContain("MY_QUESTIONS_CONTENT");
    expect(host.textContent).not.toContain("CYNOLOGIST_NOTES_CONTENT");
  });

  it("opens cynologist notes from a direct link", async () => {
    await mount(true, "notes");
    expect(host.textContent).toContain("CYNOLOGIST_NOTES_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
  });

  it("shows only two mutually exclusive @username radio options to visitors", async () => {
    await mount(false);
    const controls = [...host.querySelectorAll<HTMLButtonElement>('[role="radiogroup"] button')];
    expect(controls.map((button) => button.textContent?.trim())).toEqual([
      "Публикации @admin",
      "Вопросы @admin",
    ]);
    expect(controls.map((button) => button.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(host.textContent).not.toContain("Настройки аккаунта");
    expect(host.textContent).not.toContain("Заметки кинолога");
    await act(async () => controls[1]!.click());
    expect(controls[0]?.getAttribute("aria-checked")).toBe("false");
    expect(controls[1]?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("MY_QUESTIONS_CONTENT");
    expect(host.textContent).not.toContain("ACTIVITY_CONTENT");
    expect(window.location.search).toContain("tab=questions");

    await act(async () => controls[0]!.click());
    expect(host.textContent).toContain("ACTIVITY_CONTENT");
    expect(host.textContent).not.toContain("MY_QUESTIONS_CONTENT");
    expect(window.location.search).not.toContain("tab=questions");
  });

  it("supports direct links and back navigation for visitor questions", async () => {
    await mount(false, "questions");
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      "Вопросы @admin",
    );
    expect(host.textContent).toContain("MY_QUESTIONS_CONTENT");
    await act(async () => {
      window.history.replaceState({}, "", "/profile?username=admin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.textContent).toContain("ACTIVITY_CONTENT");
  });

  it("supports arrow-key selection for the visitor radio group", async () => {
    await mount(false);
    const first = host.querySelector<HTMLButtonElement>('[role="radio"][data-profile-view="activity"]')!;
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight", bubbles: true, cancelable: true,
    })));
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      "Вопросы @admin",
    );
  });
});
