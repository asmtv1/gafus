import { Suspense } from "react";
import { Box, CircularProgress, Alert } from "@/utils/muiImports";
import { createTrainerPanelLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getNotes } from "@/features/notes/lib/getNotes";
import NotesClient from "./NotesClient";
import { redirect, unstable_rethrow } from "next/navigation";

const logger = createTrainerPanelLogger("trainer-panel-notes-page");

async function NotesContent({ studentId }: { studentId?: string }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      redirect("/login");
    }

    // Проверка роли
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return (
        <Alert severity="error">Недостаточно прав доступа для просмотра заметок</Alert>
      );
    }

    const trainerId = session.user.id;
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
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  // Проверка роли
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const params = await searchParams;
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
      <NotesContent studentId={studentId} />
    </Suspense>
  );
}
