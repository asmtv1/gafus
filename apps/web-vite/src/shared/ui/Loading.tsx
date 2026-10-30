import type { Ref } from "react";
import styles from "./Loading.module.css";

/**
 * Единый Web-лоудер GAFUS. Использует ту же собачку, что Mobile LoadingMascot;
 * WebP и первый кадр лежат локально в public и не требуют API/CDN.
 */
export type LoadingProps = {
  message?: string;
  variant?: "inline" | "card" | "screen" | "compact" | "icon";
  className?: string;
  ref?: Ref<HTMLDivElement>;
  tabIndex?: number;
};

export function Loading({
  message = "Загружаем…",
  variant = "inline",
  className,
  ref,
  tabIndex,
}: LoadingProps) {
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      className={[styles.root, styles[variant], className].filter(Boolean).join(" ")}
      role={message ? "status" : undefined}
      aria-live={message ? "polite" : undefined}
      aria-atomic="true"
      data-gafus-loader={variant}
    >
      <span className={styles.mascot} aria-hidden="true">
        <img
          src="/images/loading-mascot-router-poster.webp"
          className={styles.poster}
          alt=""
          width={168}
          height={168}
          decoding="async"
        />
        <img
          src="/images/loading-mascot-router.webp"
          className={styles.animation}
          alt=""
          width={168}
          height={168}
          decoding="async"
        />
      </span>
      {message && <span className={styles.message}>{message}</span>}
    </div>
  );
}
