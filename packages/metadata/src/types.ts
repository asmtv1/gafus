import type { Metadata } from "next";

/**
 * Базовые параметры для генерации метаданных страницы
 */
export interface PageMetadataParams {
  /** Заголовок страницы */
  title: string;
  /** Описание страницы */
  description: string;
  /** Относительный путь (например: "/trainings/home") */
  path?: string;
  /** URL изображения для Open Graph */
  image?: string;
  /** Ширина изображения */
  imageWidth?: number;
  /** Высота изображения */
  imageHeight?: number;
  /** Alt текст для изображения */
  imageAlt?: string;
  /** Индексировать страницу? */
  noIndex?: boolean;
  /** Тип Open Graph страницы */
  ogType?: "website" | "article" | "profile";
}

/**
 * Параметры для курса
 */
export interface CourseMetadataParams {
  /** Название курса */
  name: string;
  /** Описание курса */
  description: string;
  /** Тип курса (например: "home", "focus") */
  type: string;
  /** URL логотипа курса */
  logoUrl: string;
}

/**
 * Структура JSON-LD для организации
 */
export interface OrganizationSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo: string;
  description: string;
}

/**
 * Структура JSON-LD для курса
 */
export interface CourseSchema {
  "@context": "https://schema.org";
  "@type": "Course";
  name: string;
  description: string;
  provider: {
    "@type": "Organization";
    name: string;
    url: string;
  };
}

