import { Suspense } from "react";
import { Box, CircularProgress, Alert } from "@/utils/muiImports";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getNotes } from "@/features/notes/lib/getNotes";
import NotesClient from "./NotesClient";
import { redirect, unstable_rethrow } from "next/navigation";

import { getCachedSession } from "@/shared/lib/getSessionCached";

const logger = createTrainerPanelLogger("trainer-panel-notes-page");

async function NotesContent({
  studentId,
  trainerId,
}: {
  studentId?: string;
  trainerId: string;
}) {
  try {
    const notes = await getNotes(trainerId, {
      studentId: studentId,
      page: 0,
      pageSize: 50,
    });

    return <NotesClient initialNotes={notes} />;
  } catch (error) {
    unstable_rethrow(error);
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Ошибка при загрузке заметок", err, { page: "notes" });
    return (
      <Alert severity="error">
        Ошибка при загрузке заметок:{" "}
        {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </Alert>
    );
  }
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const [session, params] = await Promise.all([getCachedSession(), searchParams]);
  if (!session?.user) {
    redirect("/login");
  }

  // Проверка роли
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const trainerId = session.user.id;
  const studentId = params.studentId;

  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "200px",
          }}
        >
          <CircularProgress />
        </Box>
      }
    >
      <NotesContent studentId={studentId} trainerId={trainerId} />
    </Suspense>
  );
}
