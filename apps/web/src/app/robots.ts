import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = "https://gafus.ru";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/reset-password",
          "/profile",
          "/favorites",
          "/statistics",
          "/trainings",
          "/_next/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
