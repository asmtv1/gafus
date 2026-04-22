import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getTrainerAvailability, getTrainerEditableSlots } from "@gafus/core";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TrainerAvailabilityPanelContainer } from "@/features/consultations/components/trainer-availability-panel-container";
import {
  addDaysToIsoDayKey,
  moscowDayRangeToUtcBounds,
  moscowTodayKey,
} from "@/features/consultations/lib/msk-day-range";

import shellStyles from "../trainer-consultations-shell.module.css";

/**
 * Расписание и исключения для консультаций кинолога (только роль TRAINER).
 * ADMIN/MODERATOR — в админке «Расписания тренеров».
 */
export default async function TrainerConsultationsAvailabilityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") {
    const base = (process.env.ADMIN_PANEL_URL ?? "https://adminka.gafus.ru").replace(/\/$/, "");
    redirect(`${base}/main-panel/consultations/trainers-schedules`);
  }
  if (session.user.role !== "TRAINER") {
    redirect("/main-panel");
  }

  const trainerUserId = session.user.id;
  const data = await getTrainerAvailability(trainerUserId);
  const slotPickerMinDayKey = moscowTodayKey();
  const slotPickerMaxDayKey = addDaysToIsoDayKey(slotPickerMinDayKey, 14);
  const { fromUtc, toUtc } = moscowDayRangeToUtcBounds(slotPickerMinDayKey, slotPickerMaxDayKey);
  const editableSlots = await getTrainerEditableSlots(trainerUserId, fromUtc, toUtc);

  return (
    <div className={shellStyles.layout}>
      <h1 className={shellStyles.pageTitle}>Расписание консультаций</h1>
      <Link className={shellStyles.navLink} href="/main-panel/consultations">
        ← К заявкам
      </Link>
      <div className={shellStyles.paper}>
        <TrainerAvailabilityPanelContainer
          trainerUserId={trainerUserId}
          initial={data}
          editableSlots={editableSlots}
          slotPickerMinDayKey={slotPickerMinDayKey}
          slotPickerMaxDayKey={slotPickerMaxDayKey}
        />
      </div>
    </div>
  );
}
