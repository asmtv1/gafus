import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getArticles } from "@gafus/core/services/article";
import ArticlesListClient from "./ArticlesListClient";

export default async function ArticlesPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "";

  const result = userId
    ? await getArticles(userId, 100, 0, userId)
    : { success: true as const, data: [] };

  const articles = result.success ? result.data : [];

  return <ArticlesListClient articles={articles} />;
}
