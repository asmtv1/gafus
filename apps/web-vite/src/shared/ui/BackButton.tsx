import type { ComponentPropsWithRef, ReactNode } from "react";
import { RouteLink, type RoutePath } from "../router/location";
import styles from "./BackButton.module.css";

/** One shared Back control skin for the header and in-page navigation. */
function BackIcon() {
  return <span className={styles.iconCircle} aria-hidden="true">
    <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor" focusable="false">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59Z" />
    </svg>
  </span>;
}

function backClass(className?: string) {
  return [styles.root, className].filter(Boolean).join(" ");
}

type BackButtonProps = ComponentPropsWithRef<"button"> & { children: ReactNode };

type BackButtonLinkProps = {
  to: RoutePath;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** For history/back actions or an in-page step with a callback. */
export function BackButton({ children, className, type = "button", ...props }: BackButtonProps) {
  return <button {...props} type={type} data-gafus-shared-button="back"
    className={backClass(className)}>
    <BackIcon /><span className={styles.label}>{children}</span>
  </button>;
}

/** For known SPA destinations: preserve native link and browser navigation semantics. */
export function BackButtonLink({ children, className, ...props }: BackButtonLinkProps) {
  return <RouteLink {...props} data-gafus-shared-button="back" className={backClass(className)}>
    <BackIcon /><span className={styles.label}>{children}</span>
  </RouteLink>;
}
