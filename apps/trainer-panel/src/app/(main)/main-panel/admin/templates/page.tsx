import { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import PageLayout from "@shared/components/PageLayout";
import AdminTemplateManager from "@features/steps/components/AdminTemplateManager";
import { getStepTemplates } from "@features/steps/lib/getStepTemplates";
import { deleteStepTemplate } from "@features/steps/lib/manageTemplates";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Управление шаблонами | GAFUS Trainer Panel",
  description: "Управление шаблонами шагов тренировок",
};

async function AdminTemplateContent() {
  const session = await getServerSession(authOptions);
  
  // Проверка прав доступа
  const userRole = session?.user ? (session.user as { role?: string }).role : undefined;
  if (!session || userRole !== 'ADMIN') {
    redirect('/main-panel');
  }

  const templates = await getStepTemplates();

  return (
    <AdminTemplateManager
      templates={templates}
      onDeleteTemplate={deleteStepTemplate}
    />
  );
}

export default function AdminTemplatesPage() {
  return (
    <PageLayout
      title="Управление шаблонами"
      subtitle="Создание и редактирование шаблонов шагов тренировок"
    >
      <Suspense
        fallback={
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        }
      >
        <AdminTemplateContent />
      </Suspense>
    </PageLayout>
  );
}

