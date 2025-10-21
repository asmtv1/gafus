/**
 * Кастомный image loader для Next.js Image компонента
 * 
 * Для файлов из /uploads/ (CDN) - отдаём напрямую без оптимизации
 * Для остальных файлов - используем стандартную оптимизацию Next.js
 */

interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  let normalizedSrc = src;

  // Преобразуем полные CDN URL в относительные пути для оптимизации через Nginx proxy
  if (src.startsWith('https://gafus-media.storage.yandexcloud.net/uploads/')) {
    normalizedSrc = src.replace('https://gafus-media.storage.yandexcloud.net', '');
  } else if (src.startsWith('https://storage.yandexcloud.net/gafus-media/uploads/')) {
    normalizedSrc = src.replace('https://storage.yandexcloud.net/gafus-media', '');
  }

  // Используем стандартную оптимизацию Next.js для всех изображений
  const params = new URLSearchParams();
  params.set('url', normalizedSrc);
  params.set('w', width.toString());
  params.set('q', (quality || 75).toString());

  return `/_next/image?${params.toString()}`;
}

