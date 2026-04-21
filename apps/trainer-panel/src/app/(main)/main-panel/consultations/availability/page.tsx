import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getTrainerAvailability, getTrainerEditableSlots } from "@gafus/core";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TrainerAvailabilityPanel } from "@/features/consultations/components/trainer-availability-panel";
import {
  addDaysToIsoDayKey,
  moscowDayRangeToUtcBounds,
  moscowTodayKey,
} from "@/features/consultations/lib/msk-day-range";

import shellStyles from "../trainer-consultations-shell.module.css";

/**
 * Расписание и исключения для консультаций кинолога.
 */
export default async function TrainerConsultationsAvailabilityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const data = await getTrainerAvailability(session.user.id);
  const slotPickerMinDayKey = moscowTodayKey();
  const slotPickerMaxDayKey = addDaysToIsoDayKey(slotPickerMinDayKey, 14);
  const { fromUtc, toUtc } = moscowDayRangeToUtcBounds(slotPickerMinDayKey, slotPickerMaxDayKey);
  const editableSlots = await getTrainerEditableSlots(session.user.id, fromUtc, toUtc);

  return (
    <div className={shellStyles.layout}>
      <h1 className={shellStyles.pageTitle}>Расписание консультаций</h1>
      <Link className={shellStyles.navLink} href="/main-panel/consultations">
        ← К заявкам
      </Link>
      <div className={shellStyles.paper}>
        <TrainerAvailabilityPanel
          initial={data}
          editableSlots={editableSlots}
          slotPickerMinDayKey={slotPickerMinDayKey}
          slotPickerMaxDayKey={slotPickerMaxDayKey}
        />
      </div>
    </div>
  );
}
