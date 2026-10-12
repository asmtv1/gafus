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

function mount(isOwner: boolean, initialView: "activity" | "questions" | "settings" = "activity") {
  return act(async () => root.render(
    <ProfileSections
      isOwner={isOwner}
      initialView={initialView}
      activity={<p>ACTIVITY_CONTENT</p>}
      questions={<p>MY_QUESTIONS_CONTENT</p>}
      settings={<p>SETTINGS_CONTENT</p>}
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

  it("never exposes a settings tab to profile visitors", async () => {
    await mount(false, "questions");
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Публикации");
    expect(host.textContent).not.toContain("Настройки аккаунта");
    expect(host.textContent).not.toContain("Мои вопросы");
    expect(host.textContent).not.toContain("MY_QUESTIONS_CONTENT");
    expect(host.textContent).not.toContain("SETTINGS_CONTENT");
    expect(host.querySelector('a[href="#profile-pets"]')).toBeNull();
  });
});
