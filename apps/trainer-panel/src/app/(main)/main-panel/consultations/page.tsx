import { getServerSession } from "next-auth";
import type { AuthRole } from "@gafus/auth";
import { authOptions } from "@gafus/auth";
import { listTrainerBookings } from "@gafus/core";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TrainerConsultationsList } from "@/features/consultations/components/trainer-consultations-list";

import shellStyles from "./trainer-consultations-shell.module.css";

/**
 * Панель тренера: заявки на консультации.
 */
export default async function TrainerConsultationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const bookings = await listTrainerBookings(
    session.user.id,
    session.user.role as AuthRole,
  );

  return (
    <div className={shellStyles.layout}>
      <h1 className={shellStyles.pageTitle}>Консультации</h1>
      <Link className={shellStyles.navLink} href="/main-panel/consultations/availability">
        Расписание и выходные →
      </Link>
      <div className={shellStyles.paper}>
        <TrainerConsultationsList bookings={bookings} />
      </div>
    </div>
  );
}
