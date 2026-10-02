import Image from "next/image";
import styles from "./LoadingState.module.css";
export function LoadingState({ message = "Загрузка…" }: { message?: string }) {
  return (
    <div className={styles.container} role="status">
      <Image
        src="/images/loading-mascot-router.webp"
        alt=""
        width={120}
        height={120}
        unoptimized
        className={styles.animated}
      />
      <Image
        src="/images/loading-mascot-router-poster.webp"
        alt=""
        width={120}
        height={120}
        className={styles.poster}
      />
      <p>{message}</p>
    </div>
  );
}
