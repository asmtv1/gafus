import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./PrimaryButton.module.css";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  size?: "regular" | "large";
};

/** Shared olive primary CTA. Keep page-specific spacing in the caller's CSS class. */
export function PrimaryButton({
  children,
  className,
  fullWidth = false,
  size = "regular",
  type = "button",
  ...props
}: PrimaryButtonProps) {
  const classNames = [
    styles.root,
    fullWidth ? styles.fullWidth : undefined,
    size === "large" ? styles.large : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...props} className={classNames} type={type}>
      {children}
    </button>
  );
}
