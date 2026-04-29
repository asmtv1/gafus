import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listAdminBookings } from "@gafus/core";
import {
  Box,
  Link as MuiLink,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { ConsultationBookingDto } from "@gafus/consultation-shared";

function bookingStatusLabel(status: ConsultationBookingDto["status"]): string {
  const map: Record<ConsultationBookingDto["status"], string> = {
    PENDING_TRAINER_CONFIRMATION: "Ожидает подтверждения",
    CONFIRMED: "Подтверждена",
    CANCELLED_BY_TRAINER: "Отменена тренером",
    CANCELLED_BY_USER: "Отменена пользователем",
    CANCELLED_BY_SLA: "Отменена по SLA",
    CANCELLED_BY_SYSTEM: "Отменена системой",
    COMPLETED: "Завершена",
    NO_SHOW: "Неявка",
  };
  return map[status] ?? status;
}

/**
 * Список всех броней консультаций (админ/модератор), до 500 последних.
 */
export default async function AdminConsultationBookingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const rows = await listAdminBookings();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Все брони консультаций
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Последние записи (до 500). Расписание и подтверждение — в панели тренера.
      </Typography>
      <MuiLink component={Link} href="/main-panel/consultations" sx={{ display: "inline-block", mb: 2 }}>
        ← К каталогу кинологов
      </MuiLink>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Статус</TableCell>
              <TableCell>Кинолог</TableCell>
              <TableCell>Слот (UTC)</TableCell>
              <TableCell>Дедлайн подтверждения</TableCell>
              <TableCell>Создана</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Нет броней
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{bookingStatusLabel(r.status)}</TableCell>
                  <TableCell>
                    {r.cynologistDisplayName ?? "—"}{" "}
                    <Typography component="span" variant="caption" color="text.secondary">
                      ({r.cynologistUserId.slice(0, 8)}…)
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {r.slot.startAtUtc} — {r.slot.endAtUtc}
                  </TableCell>
                  <TableCell>{r.confirmationDeadlineAt}</TableCell>
                  <TableCell>{r.createdAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
