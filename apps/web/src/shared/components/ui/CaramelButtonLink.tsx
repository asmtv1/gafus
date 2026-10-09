import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import styles from "./CaramelButtonLink.module.css";

type CaramelButtonLinkProps = Omit<ComponentProps<typeof Link>, "children" | "className"> & {
  children: ReactNode;
  className?: string;
};

/** Shared caramel-colored navigation action (matches the mobile button variant). */
export function CaramelButtonLink({ children, className, ...props }: CaramelButtonLinkProps) {
  return (
    <Link {...props} className={[styles.root, className].filter(Boolean).join(" ")}>
      {children}
    </Link>
  );
}
