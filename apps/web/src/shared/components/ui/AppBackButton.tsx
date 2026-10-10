import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { ArrowBackIosNewRounded } from "@mui/icons-material";

import styles from "./AppBackButton.module.css";

type SharedProps = { children?: ReactNode; className?: string };
type BackButtonProps = SharedProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;
type BackLinkProps = SharedProps & Omit<ComponentProps<typeof Link>, "children" | "className">;

function Contents({ children }: Pick<SharedProps, "children">) {
  return (
    <>
      <span className={styles.iconCircle} aria-hidden="true">
        <ArrowBackIosNewRounded className={styles.icon} />
      </span>
      <span className={styles.label}>{children ?? "Назад"}</span>
    </>
  );
}

/** Web counterpart of the shared GAFUS AppBackButton from mobile. */
export function AppBackButton({ children, className, type = "button", ...props }: BackButtonProps) {
  return <button {...props} type={type} className={[styles.root, className].filter(Boolean).join(" ")}>
    <Contents>{children}</Contents>
  </button>;
}

/** Link navigation using the exact same GAFUS back button appearance. */
export function AppBackButtonLink({ children, className, ...props }: BackLinkProps) {
  return <Link {...props} className={[styles.root, className].filter(Boolean).join(" ")}>
    <Contents>{children}</Contents>
  </Link>;
}
