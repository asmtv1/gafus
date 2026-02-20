import Link from "next/link";

import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerRow}>
          <Link href="/contacts" className={styles.footerLink}>
            Контакты
          </Link>
          <span className={styles.footerSeparator}>·</span>
          <Link href="/oferta.html" className={styles.footerLink}>
            Оферта
          </Link>
        </div>
        <div className={styles.footerRow}>
          <span className={styles.footerLabel}>Все новости и обновления в нашем телеграм-канале:</span>{" "}
          <a
            href="https://t.me/gafusRu"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.telegramLink}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className={styles.telegramIcon}
            >
              <path
                d="M9.04 16.91L9.27 20.41C9.62 20.41 9.78 20.25 9.97 20.09L11.69 18.57L15.18 21.08C15.81 21.43 16.25 21.24 16.42 20.5L18.91 9.01L18.91 9C19.12 8.08 18.6 7.73 17.99 7.97L4.72 13.03C3.81 13.38 3.81 13.93 4.56 14.17L7.76 15.17L15.78 10.06C16.15 9.83 16.48 9.95 16.21 10.18L9.04 16.91Z"
                fill="currentColor"
              />
            </svg>
            <span className={styles.telegramText}>GafusRu</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
