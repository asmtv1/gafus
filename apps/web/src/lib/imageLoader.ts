/**
 * Кастомный image loader для Next.js Image компонента
 * 
 * Обрабатывает 3 типа изображений:
 * 1. CDN файлы (/uploads/*) - в dev напрямую с CDN, в prod через Nginx proxy
 * 2. Локальные файлы из public/ - стандартная оптимизация Next.js
 * 3. Внешние URL - стандартная оптимизация Next.js
 */

interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  const isDev = process.env.NODE_ENV === 'development';
  
  // === CDN файлы (avatars, course logos) ===
  const isCDNFile = 
    src.startsWith('/uploads/') ||
    src.startsWith('https://gafus-media.storage.yandexcloud.net/uploads/') ||
    src.startsWith('https://storage.yandexcloud.net/gafus-media/uploads/');

  if (isCDNFile) {
    if (isDev) {
      // В dev отдаём CDN файлы напрямую (нет Nginx proxy)
      if (src.startsWith('/uploads/')) {
        return `https://storage.yandexcloud.net/gafus-media${src}`;
      }
      return src; // Полный CDN URL как есть
    }
    
    // В production преобразуем в относительные пути для Nginx proxy
    let normalizedSrc = src;
    if (src.startsWith('https://gafus-media.storage.yandexcloud.net/uploads/')) {
      normalizedSrc = src.replace('https://gafus-media.storage.yandexcloud.net', '');
    } else if (src.startsWith('https://storage.yandexcloud.net/gafus-media/uploads/')) {
      normalizedSrc = src.replace('https://storage.yandexcloud.net/gafus-media', '');
    }
    
    // Оптимизируем через Next.js (Nginx проксирует на CDN)
    return `/_next/image?url=${encodeURIComponent(normalizedSrc)}&w=${width}&q=${quality || 75}`;
  }

  // === Локальные файлы из public/ и внешние URL ===
  // Используем стандартную оптимизацию Next.js
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}

