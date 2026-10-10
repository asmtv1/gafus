import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import styles from "./CaramelButtonLink.module.css";

type CaramelButtonLinkProps = Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

type CaramelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Shared caramel action for form and toggle buttons. Uses the same skin as CaramelButtonLink. */
export function CaramelButton({
  children,
  className,
  type = "button",
  ...props
}: CaramelButtonProps) {
  return (
    <button {...props} type={type} className={[styles.root, className].filter(Boolean).join(" ")}>
      {children}
    </button>
  );
}

/** Shared caramel-colored navigation action (matches the mobile button variant). */
export function CaramelButtonLink({ children, className, ...props }: CaramelButtonLinkProps) {
  return (
    <Link {...props} className={[styles.root, className].filter(Boolean).join(" ")}>
      {children}
    </Link>
  );
}
