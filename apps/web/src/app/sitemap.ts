import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://gafus.ru";

  // Включаем только публичные страницы. Дополните список при появлении новых публичных URL.
  return [{ url: `${base}/`, changeFrequency: "weekly", priority: 0.8 }];
}
