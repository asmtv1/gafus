"use client";

import { useState } from "react";
import Image from "next/image";
import { getCDNUrl } from "@gafus/cdn-upload";
import styles from "./ImageViewer.module.css";

// Проверка, является ли URL blob URL
function isBlobUrl(url: string): boolean {
  return url.startsWith("blob:");
}

interface ImageViewerProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  thumbnailClassName?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
}

export default function ImageViewer({
  src,
  alt,
  width = 300,
  height = 200,
  className,
  thumbnailClassName,
  priority = false,
  loading = "lazy",
}: ImageViewerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleThumbnailClick = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleModalClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleModalClose();
    }
  };

  return (
    <>
      {/* Миниатюра изображения */}
      <div 
        className={`${styles.thumbnailContainer} ${thumbnailClassName || ""}`}
        onClick={handleThumbnailClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleThumbnailClick();
          }
        }}
        aria-label={`Открыть изображение: ${alt}`}
      >
        {isBlobUrl(src) ? (
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            className={`${styles.thumbnailImage} ${className || ""}`}
            style={{
              objectFit: "contain",
            }}
          />
        ) : (
          <Image
            src={getCDNUrl(src)}
            alt={alt}
            width={width}
            height={height}
            className={`${styles.thumbnailImage} ${className || ""}`}
            priority={priority}
            loading={loading}
            style={{
              objectFit: "contain", // Изображение полностью вписывается без обрезки
            }}
          />
        )}
        <div className={styles.thumbnailOverlay}>
          <div className={styles.zoomIcon}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M21 21L16.514 16.506L21 21ZM19 10.5C19 15.194 15.194 19 10.5 19C5.806 19 2 15.194 2 10.5C2 5.806 5.806 2 10.5 2C15.194 2 19 5.806 19 10.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 10.5H13M10.5 8V13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Модальное окно для полноразмерного изображения */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label={`Просмотр изображения: ${alt}`}
          tabIndex={-1}
        >
          <div className={styles.modalContent}>
            <button
              className={styles.closeButton}
              onClick={handleModalClose}
              aria-label="Закрыть изображение"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            
            <div className={styles.modalImageContainer}>
              {isBlobUrl(src) ? (
                <img
                  src={src}
                  alt={alt}
                  className={styles.modalImage}
                  style={{
                    objectFit: "contain",
                    width: "100%",
                    height: "100%",
                  }}
                />
              ) : (
                <Image
                  src={getCDNUrl(src)}
                  alt={alt}
                  fill
                  className={styles.modalImage}
                  priority={true}
                  style={{
                    objectFit: "contain", // Изображение полностью вписывается без обрезки
                  }}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
                />
              )}
            </div>
            
            <div className={styles.modalCaption}>
              {alt}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
