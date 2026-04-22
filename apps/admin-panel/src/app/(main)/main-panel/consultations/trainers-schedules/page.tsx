import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getTrainerAvailability,
  getTrainerEditableSlots,
} from "@gafus/core/services/consultation/availabilityService";
import { listAllTrainersForAdmin } from "@gafus/core/services/consultation/cynologistService";
import { Box, Button, Link as MuiLink, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminTrainerAvailabilityPanel } from "@/features/consultations/components/admin-trainer-availability-panel";
import {
  addDaysToIsoDayKey,
  moscowDayRangeToUtcBounds,
  moscowTodayKey,
} from "@trainer-panel/features/consultations/lib/msk-day-range";

/**
 * Админка: расписание консультаций любого тренера (те же правила, что в панели тренера).
 */
export default async function AdminTrainersSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ trainerId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const { trainerId } = await searchParams;
  const trainers = await listAllTrainersForAdmin();
  const selectedId =
    trainerId && trainers.some((t) => t.userId === trainerId) ? trainerId : trainers[0]?.userId;

  if (!selectedId) {
    return (
      <Box sx={{ maxWidth: 920, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
          Расписания тренеров
        </Typography>
        <Typography color="text.secondary">Нет пользователей с ролью тренера.</Typography>
      </Box>
    );
  }

  const data = await getTrainerAvailability(selectedId);
  const slotPickerMinDayKey = moscowTodayKey();
  const slotPickerMaxDayKey = addDaysToIsoDayKey(slotPickerMinDayKey, 14);
  const { fromUtc, toUtc } = moscowDayRangeToUtcBounds(slotPickerMinDayKey, slotPickerMaxDayKey);
  const editableSlots = await getTrainerEditableSlots(selectedId, fromUtc, toUtc);

  return (
    <Box sx={{ maxWidth: 920, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        Расписания тренеров
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Выберите тренера и отредактируйте недельное расписание, выходные и недоступные слоты.
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        {trainers.map((t) => (
          <Button
            key={t.userId}
            component={Link}
            href={`/main-panel/consultations/trainers-schedules?trainerId=${t.userId}`}
            variant={t.userId === selectedId ? "contained" : "outlined"}
            size="small"
          >
            {t.fullName ?? t.username}
          </Button>
        ))}
      </Stack>
      <MuiLink component={Link} href="/main-panel/consultations" sx={{ display: "inline-block", mb: 2 }}>
        ← Консультации (каталог)
      </MuiLink>
      <Box
        sx={{
          bgcolor: "#ffffff",
          border: "1px solid #cfd8dc",
          borderRadius: 2,
          p: { xs: 2, sm: 2.5 },
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        }}
      >
        <AdminTrainerAvailabilityPanel
          trainerUserId={selectedId}
          initial={data}
          editableSlots={editableSlots}
          slotPickerMinDayKey={slotPickerMinDayKey}
          slotPickerMaxDayKey={slotPickerMaxDayKey}
        />
      </Box>
    </Box>
  );
}
