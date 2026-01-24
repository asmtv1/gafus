/**
 * @gafus/metadata - Централизованное управление метаданными
 *
 * Этот пакет предоставляет типобезопасные утилиты для генерации
 * метаданных (Open Graph, Twitter Cards, JSON-LD) по best practices Next.js 15
 */

// Константы
export { SITE_CONFIG, DEFAULT_OG_IMAGE, SOCIAL, DESCRIPTIONS } from "./constants";

// Типы
export type {
  PageMetadataParams,
  CourseMetadataParams,
  OrganizationSchema,
  CourseSchema,
} from "./types";

// Генераторы метаданных
export {
  generatePageMetadata,
  generateCourseMetadata,
  generateStaticPageMetadata,
} from "./generators";

// JSON-LD для SEO
export { generateOrganizationSchema, generateCourseSchema, serializeJsonLd } from "./jsonld";
