"use client";

import Image from "next/image";
import { useState } from "react";

import type { OptimizedImageProps } from "@gafus/types";

import { shouldUseLazyLoading, shouldUsePriority } from "@/utils/imageLoading";

// Заглушка по умолчанию для отсутствующих изображений
const DEFAULT_PLACEHOLDER = "/uploads/course-logo.webp";

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

  // Определяем стратегию загрузки изображения
  const useLazyLoading = forceLoading || shouldUseLazyLoading(index, isAboveFold, isCritical);
  const usePriority = forcePriority || shouldUsePriority(index, isAboveFold, isCritical);

  // Используем заглушку если изображение не загрузилось или если src пустой
  const finalSrc = imgError || !src ? placeholder : src;

  const handleError = () => {
    setImgError(true);
    onError?.();
  };

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
