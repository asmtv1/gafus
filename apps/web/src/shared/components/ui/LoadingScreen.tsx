"use client";

import Image from "next/image";
import { memo } from "react";
import styles from "./LoadingScreen.module.css";

/**
 * Компонент экрана загрузки с логотипом и спиннером
 * Используется как fallback для Suspense boundaries и начальной загрузки
 */
function LoadingScreen() {
  return (
    <div className={styles.container}>
      <Image 
        src="/uploads/logo.png" 
        alt="Гафус" 
        className={styles.logo} 
        width={200} 
        height={200} 
        priority 
      />
      <div className={styles.spinner} />
    </div>
  );
}

export default memo(LoadingScreen);

