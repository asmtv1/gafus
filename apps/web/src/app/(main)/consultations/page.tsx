import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { getConsultationBookingEligibility, listListedCynologists } from "@gafus/core";
import { Alert, Box } from "@mui/material";
import { redirect } from "next/navigation";

import { ConsultationsSubNav, CynologistCatalogCards } from "@/features/consultations";

import styles from "./consultations-page.module.css";

export const metadata = generateStaticPageMetadata(
  "Консультации с кинологом",
  "Запись на онлайн-консультацию: выберите кинолога и удобный слот.",
  "/consultations",
);

/** Каталог кинологов для записи на консультацию. */
export default async function ConsultationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const cynologists = await listListedCynologists();
  const eligibility = await getConsultationBookingEligibility(session.user.id);

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>Консультации с кинологом</h1>
      <div className={styles.content}>
        <Box sx={{ width: "100%" }}>
          <ConsultationsSubNav active="catalog" />
          {!eligibility.canBook ? <Alert severity="info" sx={{ mb: 2 }}>{eligibility.message}</Alert> : null}
        </Box>
        <CynologistCatalogCards cynologists={cynologists} />
      </div>
    </main>
  );
}
