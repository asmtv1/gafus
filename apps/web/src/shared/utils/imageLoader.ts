/**
 * Custom Image Loader для Next.js Image Optimization
 * 
 * Интегрирует Yandex Cloud Storage (CDN) с Next.js Image component
 * Следует best practices Next.js для работы с внешними CDN
 */

interface ImageLoaderParams {
  src: string;
  width: number;
  quality?: number;
}

const CDN_URL = "https://gafus-media.storage.yandexcloud.net";

export default function imageLoader({ src, width, quality }: ImageLoaderParams): string {
  // Если изображение уже с CDN - возвращаем как есть
  // CDN сам обрабатывает оптимизацию и кэширование
  if (src.startsWith(CDN_URL) || src.startsWith("https://")) {
    return src;
  }

  // Для путей /uploads/* - используем CDN напрямую
  if (src.startsWith("/uploads/")) {
    return `${CDN_URL}${src}`;
  }

  // Для локальных статических файлов из /public
  // используем встроенную оптимизацию Next.js
  const params = new URLSearchParams({
    url: src,
    w: width.toString(),
    q: (quality || 75).toString(),
  });

  return `/_next/image?${params.toString()}`;
}

