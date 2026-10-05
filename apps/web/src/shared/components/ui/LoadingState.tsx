import { LoadingMascot } from "./LoadingMascot";
import styles from "./LoadingState.module.css";

interface LoadingStateProps {
  message?: string;
  size?: "small" | "large";
  variant?: "card" | "inline";
  className?: string;
}

/** Common web loading state, matching the mobile card and inline variants. */
export function LoadingState({
  message = "Загрузка…",
  size = "large",
  variant = "card",
  className,
}: LoadingStateProps) {
  const inline = variant === "inline";
  const pixelSize = inline ? (size === "small" ? 32 : 56) : size === "small" ? 112 : 168;
  return (
    <div
      className={[styles.container, inline && styles.inline, className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className={inline ? styles.inlineContent : styles.card}>
        <LoadingMascot pixelSize={pixelSize} />
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
