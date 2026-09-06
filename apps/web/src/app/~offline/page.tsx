import Link from "next/link";

import styles from "./offline.module.css";

export default function OfflinePage() {
  return (
    <div className={styles.container}>
      <section className={styles.message}>
        <h1 className={styles.title}>Офлайн-обучение доступно в мобильном приложении</h1>
        <Link href="/courses" className={styles.button}>
          К курсам
        </Link>
      </section>
    </div>
  );
}
