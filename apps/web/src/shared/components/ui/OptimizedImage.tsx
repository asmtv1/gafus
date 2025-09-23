"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { OptimizedImageProps } from "@gafus/types";

import { shouldUseLazyLoading, shouldUsePriority } from "@/utils/imageLoading";

// Заглушка по умолчанию для отсутствующих изображений
const DEFAULT_PLACEHOLDER = "/uploads/course-logo.webp";

// Определяем Safari
const isSafari = () => {
  if (typeof window === "undefined") return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  index = 0,
  isAboveFold = false,
  isCritical = false,
  placeholder = DEFAULT_PLACEHOLDER,
  unoptimized = false,
  priority: forcePriority,
  loading: forceLoading,
  onError,
  style,
}: OptimizedImageProps) {
  const [imgError, setImgError] = useState(false);
  const [isSafariBrowser] = useState(isSafari());
  const [retryCount, setRetryCount] = useState(0);

  // Определяем стратегию загрузки изображения
  const useLazyLoading = forceLoading || shouldUseLazyLoading(index, isAboveFold, isCritical);
  const usePriority = forcePriority || shouldUsePriority(index, isAboveFold, isCritical);

  // Используем заглушку если изображение не загрузилось или если src пустой
  const finalSrc = imgError || !src ? placeholder : src;

  const handleError = () => {
    console.warn(`❌ OptimizedImage: Ошибка загрузки изображения в Safari: ${src}`);
    
    // В Safari попробуем перезагрузить изображение несколько раз
    if (isSafariBrowser && retryCount < 2) {
      setRetryCount(prev => prev + 1);
      setImgError(false); // Сбрасываем ошибку для повторной попытки
      return;
    }
    
    setImgError(true);
    onError?.();
  };

  // Специальная обработка для Safari
  useEffect(() => {
    if (isSafariBrowser && src && !imgError) {
      
      // В Safari иногда нужно принудительно перезагрузить изображение
      const img = new window.Image();
      img.onload = () => {
        // Изображение загружено успешно
      };
      img.onerror = () => {
        console.warn(`⚠️ OptimizedImage: Safari - изображение не загрузилось: ${src}`);
        // Не устанавливаем ошибку сразу, даем шанс Next.js Image
      };
      img.src = src;
    }
  }, [src, isSafariBrowser, imgError, retryCount]);

  // Сбрасываем retryCount при изменении src
  useEffect(() => {
    setRetryCount(0);
    setImgError(false);
  }, [src]);

  return (
    <Image
      src={finalSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={usePriority}
      loading={usePriority ? "eager" : useLazyLoading ? "lazy" : "eager"}
      unoptimized={unoptimized || imgError || isSafariBrowser} // В Safari используем unoptimized для лучшей совместимости
      onError={handleError}
      style={style}
      // Добавляем специальные атрибуты для Safari
      {...(isSafariBrowser && {
        crossOrigin: "anonymous",
        decoding: "async" as const,
      })}
    />
  );
}
