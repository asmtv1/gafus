import styles from "@shared/components/ui/ClientLayout.module.css";

export default function ArticleLoading() {
  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Загрузка статьи"
    >
      <div className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
