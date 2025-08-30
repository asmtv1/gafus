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

  // Определяем стратегию загрузки изображения
  const useLazyLoading = forceLoading || shouldUseLazyLoading(index, isAboveFold, isCritical);
  const usePriority = forcePriority || shouldUsePriority(index, isAboveFold, isCritical);

  // Используем заглушку если изображение не загрузилось или если src пустой
  const finalSrc = imgError || !src ? placeholder : src;

  const handleError = () => {
    console.warn(`❌ OptimizedImage: Ошибка загрузки изображения в Safari: ${src}`);
    setImgError(true);
    onError?.();
  };

  // Специальная обработка для Safari
  useEffect(() => {
    if (isSafariBrowser && src && !imgError) {
      console.log(`🔧 OptimizedImage: Safari - проверяем изображение: ${src}`);
      
      // В Safari иногда нужно принудительно перезагрузить изображение
      const img = new window.Image();
      img.onload = () => {
        console.log(`✅ OptimizedImage: Safari - изображение загружено: ${src}`);
      };
      img.onerror = () => {
        console.warn(`⚠️ OptimizedImage: Safari - изображение не загрузилось: ${src}`);
        // Не устанавливаем ошибку сразу, даем шанс Next.js Image
      };
      img.src = src;
    }
  }, [src, isSafariBrowser, imgError]);

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
