import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listListedCynologists } from "@gafus/core";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConsultationsSubNav } from "@/features/consultations";
import { ConsultationBookingConfirmClient } from "@/features/consultations";

import styles from "../../consultations-page.module.css";

interface PageProps {
  params: Promise<{ cynologistUserId: string }>;
  searchParams: Promise<{ slotId?: string; startAtUtc?: string; endAtUtc?: string }>;
}

/**
 * Подтверждение перед финальным бронированием консультации.
 */
export default async function ConsultationConfirmPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { cynologistUserId } = await params;
  const query = await searchParams;
  const slotId = query.slotId?.trim();
  if (!slotId) {
    redirect(`/consultations/${encodeURIComponent(cynologistUserId)}`);
  }

  const listed = await listListedCynologists();
  const cynologist = listed.find((c) => c.userId === cynologistUserId);
  if (!cynologist) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Box sx={{ maxWidth: 720, mx: "auto" }}>
          <ConsultationsSubNav active="none" />
          <Typography variant="body2" sx={{ mb: 2 }}>
            <Link href={`/consultations/${encodeURIComponent(cynologistUserId)}`}>← Назад к слотам</Link>
          </Typography>
          <Typography component="h1" className={styles.sectionHeading} sx={{ mb: 2 }}>
            Подтверждение консультации
          </Typography>
          <ConsultationBookingConfirmClient
            slotId={slotId}
            cynologistUserId={cynologist.userId}
            cynologistName={cynologist.displayName ?? "Кинолог"}
            startAtUtc={query.startAtUtc}
            endAtUtc={query.endAtUtc}
          />
        </Box>
      </div>
    </main>
  );
}
