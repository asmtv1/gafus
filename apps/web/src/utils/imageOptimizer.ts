/**
 * Утилиты для оптимизации изображений
 */

// Поддерживаемые форматы изображений
export const SUPPORTED_FORMATS = ["webp", "avif", "png", "jpg", "jpeg"] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

// Размеры для разных устройств
export const DEVICE_SIZES = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  large: 1280,
  xlarge: 1920,
} as const;

/**
 * Проверяет поддержку WebP в браузере
 */
export function supportsWebP(): boolean {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
}

/**
 * Проверяет поддержку AVIF в браузере
 */
export function supportsAVIF(): boolean {
  if (typeof window === "undefined") return false;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/avif").indexOf("data:image/avif") === 0;
}

/**
 * Получает оптимальный формат изображения для браузера
 */
export function getOptimalFormat(): SupportedFormat {
  if (supportsAVIF()) return "avif";
  if (supportsWebP()) return "webp";
  return "png";
}

/**
 * Генерирует srcset для responsive изображений
 */
export function generateSrcSet(
  baseUrl: string,
  widths: number[] = [640, 768, 1024, 1280, 1920],
  format?: SupportedFormat,
): string {
  const optimalFormat = format || getOptimalFormat();

  return widths.map((width: number) => `${baseUrl}?w=${width}&f=${optimalFormat} ${width}w`).join(", ");
}

/**
 * Оптимизирует URL изображения
 */
export function optimizeImageUrl(
  url: string,
  width?: number,
  height?: number,
  quality = 80,
  format?: SupportedFormat,
): string {
  const optimalFormat = format || getOptimalFormat();
  const params = new URLSearchParams();

  if (width) params.set("w", width.toString());
  if (height) params.set("h", height.toString());
  params.set("q", quality.toString());
  params.set("f", optimalFormat);

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}

/**
 * Создает placeholder для изображения
 */
export function createImagePlaceholder(
  width: number,
  height: number,
  text = "Загрузка...",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Градиентный фон
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f0f0f0");
  gradient.addColorStop(1, "#e0e0e0");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Текст
  ctx.fillStyle = "#666";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);

  return canvas.toDataURL();
}

/**
 * Lazy loading для изображений
 */
export function createLazyImageObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options: IntersectionObserverInit = {
    rootMargin: "50px",
    threshold: 0.1,
  },
): IntersectionObserver {
  return new IntersectionObserver(callback, options);
}

/**
 * Предзагрузка изображений
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Сжатие изображения на клиенте
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.8,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // Вычисляем новые размеры
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      // Рисуем изображение
      ctx?.drawImage(img, 0, 0, width, height);

      // Конвертируем в blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to compress image"));
          }
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}
