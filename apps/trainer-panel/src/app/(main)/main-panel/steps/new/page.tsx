import Link from "next/link";
import { Box, Button, Alert } from "@mui/material";
import { AutoStories as TemplateIcon } from "@mui/icons-material";
import { getServerSession } from "next-auth";

import NewStepForm from "@features/steps/components/NewStepForm";
import { createStep } from "@features/steps/lib/createStep";
import FormPageLayout from "@shared/components/FormPageLayout";
import { getTrainerVideos } from "@features/trainer-videos/lib/getTrainerVideos";
import { authOptions } from "@gafus/auth";

export default async function NewStepPage() {
  const session = await getServerSession(authOptions);
  const trainerVideos = session?.user?.id ? await getTrainerVideos(session.user.id) : [];
  return (
    <FormPageLayout 
      title="Создание шага тренировки"
      subtitle="Заполните информацию о новом шаге тренировки"
    >
      <Box sx={{ mb: 3 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
            <Box>
              <strong>Совет:</strong> Используйте готовые шаблоны для быстрого создания шага!
              В библиотеке доступны проверенные методики тренировок.
            </Box>
            <Button
              component={Link}
              href="/main-panel/templates"
              variant="contained"
              startIcon={<TemplateIcon />}
              size="small"
            >
              Библиотека шаблонов
            </Button>
          </Box>
        </Alert>
      </Box>
      <NewStepForm serverAction={createStep} trainerVideos={trainerVideos} />
    </FormPageLayout>
  );
}
