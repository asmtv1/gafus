import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";
import type { ArticleListDto } from "@gafus/types";
import { getArticlesCached } from "@/shared/lib/actions/cachedArticles";
import ArticlesClient from "./ArticlesClient";

import styles from "../courses/courses.module.css";

export const metadata = generateStaticPageMetadata(
  "Статьи",
  "Чек-листы, справочники и полезные статьи для дрессировки собак.",
  "/articles"
);

export default async function ArticlesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  let articlesData: ArticleListDto[] | null = null;
  let error: string | null = null;

  try {
    const result = await getArticlesCached(userId ?? undefined);
    if (result.success) articlesData = result.data ?? null;
    else error = result.error ?? null;
  } catch (err) {
    error = err instanceof Error ? err.message : "Ошибка загрузки";
  }

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Статьи</h1>
      <ArticlesClient
        initialArticles={articlesData}
        initialError={error}
        userId={userId}
      />
    </main>
  );
}
