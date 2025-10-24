import type { Metadata } from "next";

/**
 * Генерирует Open Graph метаданные для курса
 */
export function generateCourseOGMetadata(
  courseName: string,
  courseDescription: string,
  courseType: string,
  logoImg: string,
): Metadata {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gafus.ru";
  const courseUrl = `${baseUrl}/trainings/${courseType}`;
  const imageUrl = logoImg.startsWith("http") 
    ? logoImg 
    : `${baseUrl}${logoImg}`;

  return {
    title: courseName,
    description: courseDescription,
    openGraph: {
      title: courseName,
      description: courseDescription,
      url: courseUrl,
      siteName: "Гафус",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: courseName,
        },
      ],
      locale: "ru_RU",
      type: "website",
    },
  };
}

