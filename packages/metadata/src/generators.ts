import type { Metadata } from "next";
import { SITE_CONFIG, DEFAULT_OG_IMAGE, SOCIAL } from "./constants";
import type { PageMetadataParams, CourseMetadataParams } from "./types";

/**
 * Генерирует полные метаданные для страницы
 * Использует единый паттерн для всех страниц
 */
export function generatePageMetadata(params: PageMetadataParams): Metadata {
  const {
    title,
    description,
    path = "/",
    image,
    imageWidth = DEFAULT_OG_IMAGE.width,
    imageHeight = DEFAULT_OG_IMAGE.height,
    imageAlt,
    noIndex = false,
    ogType = "website",
  } = params;

  const url = `${SITE_CONFIG.url}${path}`;
  const ogImage = image || DEFAULT_OG_IMAGE.url;
  const ogImageAlt = imageAlt || title;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_CONFIG.name,
      locale: SITE_CONFIG.locale,
      type: ogType,
      images: [
        {
          url: ogImage,
          width: imageWidth,
          height: imageHeight,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: SOCIAL.twitterCard,
      title,
      description,
      images: [ogImage],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

/**
 * Генерирует метаданные для страницы курса
 */
export function generateCourseMetadata(params: CourseMetadataParams): Metadata {
  const { name, description, type, logoUrl } = params;

  // Нормализуем URL изображения
  const imageUrl = logoUrl.startsWith("http") ? logoUrl : `${SITE_CONFIG.url}${logoUrl}`;

  return generatePageMetadata({
    title: name,
    description,
    path: `/trainings/${type}`,
    image: imageUrl,
    imageAlt: name,
    ogType: "website",
  });
}

/**
 * Генерирует метаданные для статических страниц
 * (логин, регистрация, профиль и т.д.)
 */
export function generateStaticPageMetadata(
  title: string,
  description: string,
  path?: string,
): Metadata {
  return generatePageMetadata({
    title,
    description,
    path,
  });
}
