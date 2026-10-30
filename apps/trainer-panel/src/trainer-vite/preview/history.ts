import { useSyncExternalStore } from "react";
import { matchLegacyPath } from "../routes";

const EVENT = "ag4:mock-route-change";
const ROLES = new Set(["GUEST", "USER", "PARTNER", "TRAINER", "MODERATOR", "ADMIN"]);

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function usePreviewPath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/main-panel");
}

export function validPreviewClick(
  event: Pick<MouseEvent, "button" | "defaultPrevented" |
    "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  link: HTMLAnchorElement,
): boolean {
  const href = link.getAttribute("href");
  return event.button === 0 && !event.defaultPrevented &&
    !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey &&
    !link.hasAttribute("download") && (!link.target || link.target === "_self") &&
    href !== null && matchLegacyPath(href) !== null;
}

export function navigatePreview(href: string): boolean {
  if (matchLegacyPath(href) === null) return false;
  const role = new URLSearchParams(window.location.search).get("demoRole");
  const query = role && ROLES.has(role) ? "?demoRole=" + role : "";
  if (window.location.pathname + window.location.search === href + query) return true;
  window.history.pushState(null, "", href + query);
  window.dispatchEvent(new Event(EVENT));
  return true;
}
