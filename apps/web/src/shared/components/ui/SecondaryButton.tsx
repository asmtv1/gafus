import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./SecondaryButton.module.css";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
};

/** Shared subdued action for flows where a primary CTA is already present. */
export function SecondaryButton({
  children,
  className,
  fullWidth = false,
  type = "button",
  ...props
}: SecondaryButtonProps) {
  const classNames = [styles.root, fullWidth ? styles.fullWidth : undefined, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...props} className={classNames} type={type}>
      {children}
    </button>
  );
}
