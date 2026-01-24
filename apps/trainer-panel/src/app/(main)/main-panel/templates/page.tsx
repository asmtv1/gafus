import { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import PageLayout from "@shared/components/PageLayout";
import TemplateLibrary from "@features/steps/components/TemplateLibrary";
import { getStepTemplates } from "@features/steps/lib/getStepTemplates";
import { getStepCategories } from "@features/steps/lib/getStepCategories";
import { createStepFromTemplate } from "@features/steps/lib/createStepFromTemplate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Библиотека шаблонов | GAFUS Trainer Panel",
  description: "Готовые шаблоны шагов тренировок",
};

async function TemplateLibraryContent() {
  const [templates, categories] = await Promise.all([getStepTemplates(), getStepCategories()]);

  return (
    <TemplateLibrary
      initialTemplates={templates}
      categories={categories}
      onUseTemplate={createStepFromTemplate}
    />
  );
}

export default function TemplatesPage() {
  return (
    <PageLayout
      title="Библиотека шаблонов"
      subtitle="Выберите готовый шаблон для быстрого создания шага тренировки"
    >
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        }
      >
        <TemplateLibraryContent />
      </Suspense>
    </PageLayout>
  );
}
