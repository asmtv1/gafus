import { useLayoutEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./PetActionDialog.module.css";

/** Only the owner-action content enters this modal; no external document/body
 * listener can turn a backdrop click into a destructive form submission. */
export function PetActionDialog({ title, busy, onClose, children, variant = "default" }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: "default" | "prevention" | "edit";
}) {
  const heading = useId();
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(
      "[data-initial-focus]:not([disabled]),input:not([disabled])," +
      "select:not([disabled]),button:not([disabled])",
    )?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
    ) ?? [])].filter(element => element.getClientRects().length > 0);
    if (focusable.length < 1) { event.preventDefault(); return; }
    const active = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && active <= 0) {
      event.preventDefault(); focusable.at(-1)?.focus();
    } else if (!event.shiftKey && active === focusable.length - 1) {
      event.preventDefault(); focusable[0]?.focus();
    }
  };
  return createPortal(<div className={styles.backdrop} data-pet-action-dialog="true">
    <div ref={panel} className={[styles.dialog,
      variant === "prevention" ? styles.preventionDialog : "",
      variant === "edit" ? styles.editDialog : "",
    ].filter(Boolean).join(" ")} role="dialog" aria-modal="true"
      aria-labelledby={heading} onKeyDown={keys}>
      {variant === "edit" && <img className={styles.editLogo}
        src="/images/gafus-logo-mascot.webp" alt="" aria-hidden="true"/>}
      <h2 className={[styles.title,
        variant === "prevention" ? styles.preventionTitle : "",
        variant === "edit" ? styles.editTitle : "",
      ].filter(Boolean).join(" ")} id={heading}>{title}</h2>
      {children}
    </div>
  </div>, document.body);
}
