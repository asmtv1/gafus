import { LoadingMascot } from "./LoadingMascot";
import styles from "./LoadingState.module.css";

interface LoadingStateProps {
  message?: string;
  variant?: "card" | "inline";
  className?: string;
}

/** Shared loading state. Card/inline change layout, never mascot size (168 px). */
export function LoadingState({
  message = "Загрузка…",
  variant = "card",
  className,
}: LoadingStateProps) {
  const inline = variant === "inline";
  return (
    <div
      className={[styles.container, inline && styles.inline, className].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className={inline ? styles.inlineContent : styles.card}>
        <LoadingMascot />
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}
