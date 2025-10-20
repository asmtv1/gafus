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
  // Файлы с CDN отдаём напрямую
  // 1. Относительный путь: /uploads/*
  // 2. Полный URL с CDN: https://gafus-media.storage.yandexcloud.net/uploads/*
  // 3. Альтернативный формат: https://storage.yandexcloud.net/gafus-media/uploads/*
  if (
    src.startsWith('/uploads/') ||
    src.startsWith('https://gafus-media.storage.yandexcloud.net/uploads/') ||
    src.startsWith('https://storage.yandexcloud.net/gafus-media/uploads/')
  ) {
    return src;
  }

  // Для остальных файлов используем стандартную оптимизацию Next.js
  const params = new URLSearchParams();
  params.set('url', src);
  params.set('w', width.toString());
  params.set('q', (quality || 75).toString());

  return `/_next/image?${params.toString()}`;
}

