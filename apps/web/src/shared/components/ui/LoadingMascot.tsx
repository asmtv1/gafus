import Image from "next/image";

import styles from "./LoadingState.module.css";

/** Fixed app-wide mascot size: compact loading mascots are not supported. */
export const STANDARD_LOADING_MASCOT_PX = 168;

/** Shared mascot; the poster is visible while the animation loads. */
export function LoadingMascot() {
  return (
    <span
      className={styles.mascot}
      style={{ width: STANDARD_LOADING_MASCOT_PX, height: STANDARD_LOADING_MASCOT_PX }}
      aria-hidden="true"
    >
      <Image
        src="/images/loading-mascot-router-poster.webp"
        alt=""
        width={STANDARD_LOADING_MASCOT_PX}
        height={STANDARD_LOADING_MASCOT_PX}
        unoptimized
        className={styles.poster}
      />
      <Image
        src="/images/loading-mascot-router.webp"
        alt=""
        width={STANDARD_LOADING_MASCOT_PX}
        height={STANDARD_LOADING_MASCOT_PX}
        unoptimized
        className={styles.animated}
      />
    </span>
  );
}
