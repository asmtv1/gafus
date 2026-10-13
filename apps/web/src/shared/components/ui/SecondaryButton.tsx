import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import styles from "./SecondaryButton.module.css";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  variant?: "default" | "red";
};

type SecondaryButtonLinkProps = Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  variant?: "default" | "red";
};

function buttonClasses(
  className?: string,
  fullWidth = false,
  variant: "default" | "red" = "default",
) {
  return [
    styles.root,
    variant === "red" ? styles.red : undefined,
    fullWidth ? styles.fullWidth : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Shared subdued action for flows where a primary CTA is already present. */
export function SecondaryButton({
  children,
  className,
  fullWidth = false,
  variant = "default",
  type = "button",
  ...props
}: SecondaryButtonProps) {
  const classNames = buttonClasses(className, fullWidth, variant);

  return (
    <button {...props} className={classNames} type={type}>
      {children}
    </button>
  );
}

/** Navigable secondary button, styled identically to the action counterpart. */
export function SecondaryButtonLink({
  children,
  className,
  fullWidth = false,
  variant = "default",
  ...props
}: SecondaryButtonLinkProps) {
  return (
    <Link {...props} className={buttonClasses(className, fullWidth, variant)}>
      {children}
    </Link>
  );
}
