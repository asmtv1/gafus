import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import styles from "./PrimaryButton.module.css";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  size?: "regular" | "large";
};

type PrimaryButtonLinkProps = Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  size?: "regular" | "large";
};

/** Class for library buttons (for example MUI) that cannot render PrimaryButton directly. */
export const primaryButtonClassName = "gafus-primary-button";

function getPrimaryButtonClassName(
  className: string | undefined,
  fullWidth: boolean,
  size: "regular" | "large",
) {
  return [
    styles.root,
    primaryButtonClassName,
    fullWidth ? styles.fullWidth : undefined,
    size === "large" ? styles.large : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Shared olive primary CTA. Keep page-specific spacing in the caller's CSS class. */
export function PrimaryButton({
  children,
  className,
  fullWidth = false,
  size = "regular",
  type = "button",
  ...props
}: PrimaryButtonProps) {
  const classNames = getPrimaryButtonClassName(className, fullWidth, size);

  return (
    <button {...props} className={classNames} type={type}>
      {children}
    </button>
  );
}

/** Link-shaped counterpart of PrimaryButton for navigation CTAs. */
export function PrimaryButtonLink({
  children,
  className,
  fullWidth = false,
  size = "regular",
  ...props
}: PrimaryButtonLinkProps) {
  return (
    <Link {...props} className={getPrimaryButtonClassName(className, fullWidth, size)}>
      {children}
    </Link>
  );
}
