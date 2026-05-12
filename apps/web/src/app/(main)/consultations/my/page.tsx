import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { listClientBookings } from "@gafus/core";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { Box } from "@mui/material";
import { redirect } from "next/navigation";
import { requireWebAppSubscription } from "@shared/lib/app-subscription/server";

import { ConsultationsSubNav } from "@/features/consultations/components/consultations-sub-nav";
import { MyConsultationsClient } from "@/features/consultations/components/my-consultations-client";

import styles from "../consultations-page.module.css";

export const metadata = generateStaticPageMetadata(
  "Мои консультации",
  "Ваши записи на консультации с кинологом.",
  "/consultations/my",
);

/**
 * Мои бронирования консультаций.
 */
export default async function MyConsultationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  await requireWebAppSubscription(session.user.id);

  const { items } = await listClientBookings(session.user.id);

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>Мои консультации</h1>
      <div className={styles.content}>
        <Box sx={{ maxWidth: 960, width: "100%", mx: "auto" }}>
          <ConsultationsSubNav active="my" />
          <MyConsultationsClient initialItems={items} />
        </Box>
      </div>
    </main>
  );
}
