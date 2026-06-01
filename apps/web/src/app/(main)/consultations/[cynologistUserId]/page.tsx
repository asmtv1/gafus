import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listListedCynologists } from "@gafus/core";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ConsultationsSubNav } from "@/features/consultations";
import { CynologistSlotsClient } from "@/features/consultations";

import styles from "../consultations-page.module.css";

interface PageProps {
  params: Promise<{ cynologistUserId: string }>;
}

/**
 * Выбор слота у выбранного кинолога.
 */
export default async function ConsultationCynologistPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { cynologistUserId } = await params;
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
            <Link href="/consultations">← Все кинологи</Link>
          </Typography>
          <Typography component="h1" className={styles.sectionHeading} sx={{ mb: 2 }}>
            {cynologist.displayName ?? "Кинолог"}
          </Typography>
          <CynologistSlotsClient cynologist={cynologist} />
        </Box>
      </div>
    </main>
  );
}
