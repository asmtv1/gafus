import type { MouseEvent } from "react";
import { cancelToPreviousPage, type RoutePath } from "../router/location";
import { SecondaryButtonLink } from "./Buttons";

/** Cancel discards local draft by leaving the mounted page. No form submit.
 * Back is used only for a known SPA history entry; deep links fall back. */
export function CancelNavigationLink({ fallback, disabled = false, className }: {
  fallback: RoutePath; disabled?: boolean; className?: string;
}) {
  function onCancel(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled) { event.preventDefault(); return; }
    if (event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey) return;
    event.preventDefault();
    cancelToPreviousPage(fallback);
  }
  return <SecondaryButtonLink href={fallback} variant="red" className={className}
    aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} onClick={onCancel}>
    Отмена
  </SecondaryButtonLink>;
}
