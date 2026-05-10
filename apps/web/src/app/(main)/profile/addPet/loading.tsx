import styles from "./AddPetForm.module.css";

export default function AddPetLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-busy>
        <h1 className={styles.title}>Добавить питомца</h1>
        <p className={styles.loadingHint}>Загрузка…</p>
      </section>
    </main>
  );
}
