import { SITE_CONFIG, DEFAULT_OG_IMAGE } from "./constants";
import type { OrganizationSchema, CourseSchema } from "./types";

/**
 * Генерирует JSON-LD для организации (используется на главной странице)
 */
export function generateOrganizationSchema(): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    logo: DEFAULT_OG_IMAGE.url,
    description: SITE_CONFIG.description,
  };
}

/**
 * Генерирует JSON-LD для курса
 */
export function generateCourseSchema(courseName: string, courseDescription: string): CourseSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: courseName,
    description: courseDescription,
    provider: {
      "@type": "Organization",
      name: SITE_CONFIG.name,
      url: SITE_CONFIG.url,
    },
  };
}

/**
 * Генерирует JSON-LD script tag для вставки в head
 * Использование в Next.js:
 * 
 * ```tsx
 * export default function Page() {
 *   const schema = generateOrganizationSchema();
 *   return (
 *     <>
 *       <script
 *         type="application/ld+json"
 *         dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
 *       />
 *       <main>...</main>
 *     </>
 *   );
 * }
 * ```
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}

