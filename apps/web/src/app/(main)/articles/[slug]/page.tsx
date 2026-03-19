import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getCDNUrl } from "@gafus/cdn-upload";
import { getArticleBySlug } from "@gafus/core/services/article";
import ArticleDetailClient from "./ArticleDetailClient";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getArticleBySlug(slug);
  if (!result.success || !result.data) return {};
  const article = result.data;
  return {
    title: article.title,
    description: `Статья: ${article.title}`,
    openGraph: {
      title: article.title,
      images: (article.logoImg || article.imageUrls[0])
        ? [
            {
              url: (article.logoImg || article.imageUrls[0]).startsWith("http")
                ? (article.logoImg || article.imageUrls[0])
                : getCDNUrl(article.logoImg || article.imageUrls[0]),
            },
          ]
        : [],
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const result = await getArticleBySlug(slug, userId);

  if (!result.success) notFound();

  return (
    <ArticleDetailClient
      article={result.data}
      userId={userId}
    />
  );
}
