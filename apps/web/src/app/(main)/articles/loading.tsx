import styles from "@shared/components/ui/ClientLayout.module.css";

export default function ArticlesLoading() {
  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
