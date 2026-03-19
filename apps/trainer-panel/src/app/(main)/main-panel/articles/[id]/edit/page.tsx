import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getArticleForEdit } from "@gafus/core/services/article";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { Typography } from "@mui/material";
import FormPageLayout from "@shared/components/FormPageLayout";
import { ArticleForm } from "@/features/articles/components/ArticleForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? "";

  if (!userId) {
    return (
      <FormPageLayout title="Редактирование статьи">
        <Typography color="error">Необходима авторизация</Typography>
      </FormPageLayout>
    );
  }

  const [result, trainerVideos] = await Promise.all([
    getArticleForEdit(id, userId),
    getTrainerVideos(userId),
  ]);

  if (!result.success) {
    return (
      <FormPageLayout title="Редактирование статьи">
        <Typography color="error">{result.error}</Typography>
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout
      title="Редактировать статью"
      subtitle="Измените содержимое статьи"
    >
      <ArticleForm
        mode="edit"
        articleId={id}
        initialValues={result.data}
        trainerVideos={trainerVideos}
      />
    </FormPageLayout>
  );
}
