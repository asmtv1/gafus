import Link from "next/link";

import styles from "./consultations-sub-nav.module.css";

export type ConsultationsSubNavActive = "catalog" | "my" | "none";

interface ConsultationsSubNavProps {
  active: ConsultationsSubNavActive;
}

/**
 * Переключатель раздела «Занятия с кинологом»: каталог ↔ мои записи.
 */
export function ConsultationsSubNav({ active }: ConsultationsSubNavProps) {
  return (
    <nav className={styles.subNav} aria-label="Раздел консультаций">
      <Link
        href="/consultations"
        className={active === "catalog" ? styles.subNavLinkActive : styles.subNavLink}
        aria-current={active === "catalog" ? "page" : undefined}
      >
        Каталог кинологов
      </Link>
      <Link
        href="/consultations/my"
        className={active === "my" ? styles.subNavLinkActive : styles.subNavLink}
        aria-current={active === "my" ? "page" : undefined}
      >
        Мои консультации
      </Link>
    </nav>
  );
}
