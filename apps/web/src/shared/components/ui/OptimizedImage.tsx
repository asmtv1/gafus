"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createWebLogger } from "@gafus/logger";

import type { OptimizedImageProps } from "./types";

import { shouldUseLazyLoading, shouldUsePriority } from "@shared/utils/imageLoading";

// Создаем логгер для изображений
const logger = createWebLogger("web-optimized-image");

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
    logger.warn(`❌ OptimizedImage: Ошибка загрузки изображения`, {
      operation: "image_load_error",
      src: src,
      retryCount: retryCount,
      isSafariBrowser: isSafariBrowser,
    });

    // Попробуем перезагрузить изображение несколько раз
    if (retryCount < 2) {
      setRetryCount((prev) => prev + 1);
      setImgError(false);
      return;
    }

    setImgError(true);
    onError?.();
  };

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
      unoptimized={unoptimized || imgError}
      onError={handleError}
      style={style}
    />
  );
}
