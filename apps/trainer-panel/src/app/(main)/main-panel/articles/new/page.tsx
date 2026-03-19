import { getServerSession } from "next-auth";

import { authOptions } from "@gafus/auth";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import FormPageLayout from "@shared/components/FormPageLayout";
import { ArticleForm } from "@/features/articles/components/ArticleForm";

export default async function NewArticlePage() {
  const session = await getServerSession(authOptions);
  const trainerVideos = session?.user?.id ? await getTrainerVideos(session.user.id) : [];

  return (
    <FormPageLayout
      title="Создать статью"
      subtitle="Заполните поля для новой статьи"
    >
      <ArticleForm mode="create" trainerVideos={trainerVideos} />
    </FormPageLayout>
  );
}
