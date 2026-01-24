import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerText}>
        Все новости и обновления в нашем телеграм-канале:{" "}
        <a
          href="https://t.me/gafusRu"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.telegramLink}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            style={{ verticalAlign: "middle", marginRight: 4 }}
          >
            <path
              d="M9.04 16.91L9.27 20.41C9.62 20.41 9.78 20.25 9.97 20.09L11.69 18.57L15.18 21.08C15.81 21.43 16.25 21.24 16.42 20.5L18.91 9.01L18.91 9C19.12 8.08 18.6 7.73 17.99 7.97L4.72 13.03C3.81 13.38 3.81 13.93 4.56 14.17L7.76 15.17L15.78 10.06C16.15 9.83 16.48 9.95 16.21 10.18L9.04 16.91Z"
              fill="#636128"
            />
          </svg>
          <span className={styles.telegramText}>GafusRu</span>
        </a>
      </p>
    </footer>
  );
}
