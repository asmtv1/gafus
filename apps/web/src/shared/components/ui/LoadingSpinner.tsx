"use client";

import { memo } from "react";
import styles from "./LoadingSpinner.module.css";

/**
 * Компактный спиннер для inline loading (используется в dynamic imports)
 * Не занимает весь экран, только показывает индикатор загрузки
 */
function LoadingSpinner() {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} />
    </div>
  );
}

export default memo(LoadingSpinner);

