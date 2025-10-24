"use client";
import { useState } from "react";
import styles from "./ShareButton.module.css";

interface ShareButtonProps {
  courseName: string;
  courseType: string;
  courseDescription?: string;
}

export default function ShareButton({ courseName, courseType, courseDescription }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/trainings/${courseType}`;
    const shareText = courseDescription 
      ? `${courseName}\n\n${courseDescription}\n\n`
      : `${courseName}\n\n`;
    const shareTitle = `Курс: ${courseName}`;

    // Проверяем поддержку Web Share API (мобильные устройства)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        // Пользователь отменил шаринг или ошибка
        if ((error as Error).name !== "AbortError") {
          console.error("Ошибка при шаринге:", error);
        }
      }
    } else {
      // Десктоп - копируем ссылку в буфер обмена
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Ошибка при копировании:", error);
      }
    }
  };

  return (
    <button 
      className={styles.shareButton} 
      onClick={handleShare}
      title="Поделиться курсом"
    >
      <svg 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none"
        className={styles.shareIcon}
      >
        <path 
          d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.shareText}>
        {copied ? "Ссылка скопирована!" : "Поделиться ссылкой на курс"}
      </span>
    </button>
  );
}

