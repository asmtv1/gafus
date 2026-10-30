// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  articlePath, articleSlugFromPath, coursePath, normalizedPathname, navigate,
  petPath, questionPath, momentPath, momentCommentPath, momentIdFromPath,
  legacyMomentEditId, legacyMomentEditPath,
  momentDraftPath, momentDraftIdFromPath,
  momentProfilePath, momentProfileUsernameFromPath,
  routeForPath, RouteLink, useRoutePath, chatDialogPath, chatDialogIdFromPath,
  cancelToPreviousPage,
} from "./location";

let container: HTMLDivElement;
let root: Root;

function RouteProbe() {
  const path = useRoutePath();
  return <div>
    <output>{path ?? "not-found"}</output>
    <RouteLink to="/pets" current={path === "/pets"}>Мои питомцы</RouteLink>
  </div>;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(RouteProbe)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

describe("trainer notification chat deep-link routing", () => {
  it("accepts only one safe dialog ID, never malformed or encoded delimiters", () => {
    expect(chatDialogPath("chat-A")).toBe("/cynologist-chats/chat-A");
    expect(chatDialogIdFromPath("/cynologist-chats/chat-A")).toBe("chat-A");
    expect(routeForPath("/cynologist-chats/chat-A")).toBe("/cynologist-chats/chat-A");
    for (const bad of ["/cynologist-chats/", "/cynologist-chats/%2Fadmin",
      "/cynologist-chats/chat-A/more", "/cynologist-chats/../admin",
      "/cynologist-chats/chat A", "/cynologist-chats/chat?tab=community"]) {
      expect(chatDialogIdFromPath(bad)).toBeNull();
      expect(routeForPath(bad)).toBeNull();
    }
    expect(() => chatDialogPath("../admin")).toThrow("Invalid chat dialog ID");
  });
});

describe("refactor web same-origin route controls", () => {
  it("accepts only explicit registered routes, rejects lookalikes", () => {
    for (const route of [
      "/", "/courses", "/profile", "/pets", "/articles", "/questions",
      "/passwordReset", "/reset-password", "/subscription", "/vk-consent", "/questions/new", "/moments", "/moments/saved",
      "/moments/new", "/moments/drafts",
    ]) expect(routeForPath(route)).toBe(route);
    expect(routeForPath("/pets/")).toBe("/pets");
    expect(momentPath("post-A")).toBe("/moments/post-A");
    expect(momentIdFromPath("/moments/post-A")).toBe("post-A");
    expect(routeForPath("/moments/post-A")).toBe("/moments/post-A");
    expect(routeForPath("/moments/saved")).toBe("/moments/saved");
    expect(momentIdFromPath("/moments/saved")).toBeNull();
    expect(momentIdFromPath("/moments/new")).toBeNull();
    expect(momentIdFromPath("/moments/drafts")).toBeNull();
    expect(momentIdFromPath("/moments/drafts/post-A")).toBeNull();
    expect(routeForPath("/moments/new")).toBe("/moments/new");
    expect(routeForPath("/moments/drafts")).toBe("/moments/drafts");
    expect(momentDraftPath("post-A")).toBe("/moments/drafts/post-A");
    expect(momentDraftIdFromPath("/moments/drafts/post-A")).toBe("post-A");
    expect(routeForPath("/moments/drafts/post-A")).toBe("/moments/drafts/post-A");
    expect(momentDraftIdFromPath("/moments/drafts/%2Fbad")).toBeNull();
    expect(momentProfilePath("trainer")).toBe("/moments/profile/trainer");
    expect(momentProfileUsernameFromPath("/moments/profile/trainer")).toBe("trainer");
    expect(routeForPath("/moments/profile/trainer")).toBe("/moments/profile/trainer");
    expect(momentProfileUsernameFromPath("/moments/profile/%2Fadmin")).toBeNull();
    expect(() => momentProfilePath("../admin")).toThrow("Invalid moment profile");
    expect(() => momentDraftPath("../admin")).toThrow("Invalid draft ID");
    expect(momentIdFromPath("/moments/../secret")).toBeNull();
    expect(routeForPath("/moments/%2Fadmin")).toBeNull();
    expect(() => momentPath("../admin")).toThrow("Invalid moment ID");
    expect(questionPath("question-A")).toBe("/questions/question-A");
    expect(routeForPath("/questions/question-A")).toBe("/questions/question-A");
    expect(routeForPath("/questions/new")).toBe("/questions/new");
    expect(routeForPath("/questions/%2Fadmin")).toBeNull();
    expect(coursePath("course-A")).toBe("/courses/course-A");
    expect(routeForPath("/courses/course-A")).toBe("/courses/course-A");
    expect(routeForPath("/courses/../secrets")).toBeNull();
    expect(routeForPath("/pets/pet123")).toBe("/pets/pet123");
    expect(petPath("pet123")).toBe("/pets/pet123");
    const articleUrl = articlePath("собаки");
    expect(articleSlugFromPath(articleUrl)).toBe("собаки");
    expect(routeForPath(articleUrl)).toBe(articleUrl);
    expect(() => petPath("..")).toThrow();
    for (const path of [
      "/pets/other/more", "/api/v1/pets", "/passwordReset/secret",
      "//evil.test", "/profile?secret", "/../../users", "https://other.test",
    ]) expect(routeForPath(path)).toBeNull();
    expect(normalizedPathname("/profile/")).toBe("/profile");
  });

  it("does not mistake the reserved Moments profile prefix for a post ID", () => {
    expect(momentIdFromPath("/moments/profile")).toBeNull();
    expect(routeForPath("/moments/profile")).toBeNull();
    expect(routeForPath("/feed/profile")).toBeNull();
    expect(routeForPath("/moments/profile/owner_1"))
      .toBe("/moments/profile/owner_1");
    expect(() => momentPath("profile")).toThrow("Invalid moment ID");
  });

  it("programmatic navigation denies malformed or external paths", async () => {
    const original = window.location.href;
    for (const invalid of [
      "//evil.invalid", "/pets/%2Fadmin", "/moments/profile",
      "/courses?evil=value", "/not-a-route", "/questions/../admin",
    ]) {
      expect(() => navigate(invalid as never)).toThrow("Invalid route");
      expect(window.location.href).toBe(original);
      expect(container.querySelector("output")?.textContent).toBe("/");
    }
    await act(async () => navigate("/courses"));
    expect(window.location.pathname).toBe("/courses");
    expect(container.querySelector("output")?.textContent).toBe("/courses");
  });

  it("retains Next /feed/create?edit=id with one safe query and no draft redirect", async () => {
    expect(legacyMomentEditId("?edit=post_1")).toBe("post_1");
    expect(legacyMomentEditId("?unrelated=x")).toBeUndefined();
    expect(legacyMomentEditPath("post_1")).toBe("/feed/create?edit=post_1");
    await act(async () => navigate(legacyMomentEditPath("post_1")));
    expect(window.location.pathname).toBe("/feed/create");
    expect(window.location.search).toBe("?edit=post_1");
    const before = window.location.href;
    for (const query of ["?edit=", "?edit=%2Fadmin", "?edit=x&edit=y",
      "?edit=x&shadow=y", "?edit=../admin", "?edit=%3Cscript%3E"]) {
      expect(legacyMomentEditId(query)).toBeNull();
      expect(() => navigate(("/feed/create" + query) as never)).toThrow("Invalid route");
      expect(window.location.href).toBe(before);
    }
    expect(() => legacyMomentEditPath("../admin")).toThrow("Invalid moment edit");
    await act(async () => navigate("/moments/new"));
    expect(window.location.search).toBe("");
  });

  it("navigates to a single safe Moments reply focus and rejects forged query data", async () => {
    const deep = momentCommentPath("post_1", "comment_1");
    expect(deep).toBe("/moments/post_1?commentId=comment_1");
    await act(async () => navigate(deep));
    expect(window.location.pathname).toBe("/moments/post_1");
    expect(window.location.search).toBe("?commentId=comment_1");
    const before = window.location.href;
    for (const unsafe of [
      "/moments/post_1?commentId=bad%2Fid", "/moments/post_1?commentId=x&evil=y",
      "/moments/post_1?commentId=x#evil", "/moments/post_1?commentId=",
      "/moments/profile?commentId=comment_1", "/courses?commentId=comment_1",
      "/moments/post_1?commentId=%2e%2e", "//evil.test/moments/post_1?commentId=x",
    ]) {
      expect(() => navigate(unsafe as never)).toThrow("Invalid route");
      expect(window.location.href).toBe(before);
    }
    expect(() => momentCommentPath("post_1", "bad/path")).toThrow("Invalid moment comment");
    await act(async () => navigate("/moments/post_1"));
    expect(window.location.search).toBe("");
  });

  it("real link keeps address visible and provides forward/back navigation", async () => {
    const link = container.querySelector("a")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => link.dispatchEvent(click));
    expect(click.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe("/pets");
    expect(container.querySelector("output")?.textContent).toBe("/pets");
    expect(container.querySelector("a")?.getAttribute("aria-current")).toBe("page");
    await act(async () => {
      window.history.replaceState(null, "", "/courses");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.querySelector("output")?.textContent).toBe("/courses");
    expect(container.querySelector("a")?.getAttribute("aria-current")).toBeNull();
    await act(async () => navigate("/profile"));
    expect(window.location.pathname).toBe("/profile");
    expect(container.querySelector("output")?.textContent).toBe("/profile");
  });

  it("never intercepts a modified click that should open a separate tab", async () => {
    const cmdClick = new MouseEvent("click", {
      bubbles: true, cancelable: true, button: 0, ctrlKey: true,
    });
    // Let React receive the click first, then suppress jsdom's unsupported
    // cross-document navigation. Capture whether our router intercepted it.
    let intercepted = true;
    document.addEventListener("click", event => {
      intercepted = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    await act(async () => container.querySelector("a")!.dispatchEvent(cmdClick));
    expect(intercepted).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it("cancellation uses native back for verified in-app navigation", async () => {
    window.history.replaceState(null, "", "/profile?tab=settings");
    await act(async () => navigate("/profile/change-email"));
    expect(window.history.state?.__gafusSpaNavigation).toBe(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    cancelToPreviousPage("/profile");
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it("cancellation from a direct deep link falls back safely", async () => {
    window.history.replaceState(null, "", "/profile/change-password");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    await act(async () => cancelToPreviousPage("/profile"));
    expect(window.location.pathname).toBe("/profile");
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it("route selection reacts to direct history restore", async () => {
    await act(async () => {
      window.history.replaceState(null, "", "/articles");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.querySelector("output")?.textContent).toBe("/articles");
    await act(async () => {
      window.history.replaceState(null, "", "/unknown-route");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(container.querySelector("output")?.textContent).toBe("not-found");
  });
});
