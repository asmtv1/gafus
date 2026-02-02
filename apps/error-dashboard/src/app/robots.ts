import type { MetadataRoute } from "next";

/** Блокирует индексацию всего error-dashboard поисковиками */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
