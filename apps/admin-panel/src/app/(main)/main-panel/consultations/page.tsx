import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listAllTrainersForAdmin } from "@gafus/core";
import { Box, Button, Paper, Typography } from "@mui/material";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminConsultationsList } from "@/features/consultations/components/admin-consultations-list";

/**
 * Админка: список тренеров и флаг «в каталоге консультаций».
 */
export default async function AdminConsultationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const rows = await listAllTrainersForAdmin();

  return (
    <Box
      sx={{
        maxWidth: 920,
        mx: "auto",
        px: { xs: 2, sm: 3 },
        py: 3,
      }}
    >
      <Typography
        variant="h4"
        component="h1"
        sx={{
          color: "#1a1a1a",
          fontWeight: 700,
          mb: 1.5,
        }}
      >
        Консультации с кинологом
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: "#37474f",
          mb: 2,
          lineHeight: 1.6,
          maxWidth: 720,
        }}
      >
        Отметьте тренеров, которых видят пользователи на странице консультаций. Расписание и слоты
        настраивает тренер в своей панели; администратор может править любое расписание в разделе
        «Расписания тренеров».
      </Typography>
      <Button
        component={Link}
        href="/main-panel/consultations/bookings"
        variant="outlined"
        color="primary"
        sx={{ mb: 3, fontWeight: 600 }}
      >
        Все брони
      </Button>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          bgcolor: "#ffffff",
          border: "1px solid #cfd8dc",
          borderRadius: 2,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <AdminConsultationsList trainers={rows} />
      </Paper>
    </Box>
  );
}
