import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerText}>
        Все новости и обновления в нашем телеграм-канале:{" "}
        <a href="https://t.me/gafusRu" target="_blank" rel="noopener noreferrer">
          gafusRu
        </a>
      </p>
    </footer>
  );
}
