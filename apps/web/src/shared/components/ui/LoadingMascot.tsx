import Image from "next/image";

import styles from "./LoadingState.module.css";

/** Shared mascot; the poster is visible while the animation loads. */
export function LoadingMascot({ pixelSize = 168 }: { pixelSize?: number }) {
  return (
    <span
      className={styles.mascot}
      style={{ width: pixelSize, height: pixelSize }}
      aria-hidden="true"
    >
      <Image
        src="/images/loading-mascot-router-poster.webp"
        alt=""
        width={pixelSize}
        height={pixelSize}
        unoptimized
        className={styles.poster}
      />
      <Image
        src="/images/loading-mascot-router.webp"
        alt=""
        width={pixelSize}
        height={pixelSize}
        unoptimized
        className={styles.animated}
      />
    </span>
  );
}
