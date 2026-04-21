import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { listListedCynologists } from "@gafus/core";
import { Box, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { ConsultationsSubNav } from "@/features/consultations/components/consultations-sub-nav";
import { CynologistCatalogCards } from "@/features/consultations/components/cynologist-catalog-cards";

import styles from "./consultations-page.module.css";

export const metadata = generateStaticPageMetadata(
  "Консультации с кинологом",
  "Запись на онлайн-консультацию: выберите кинолога и удобный слот.",
  "/consultations",
);

/**
 * Каталог кинологов для записи на консультацию.
 */
export default async function ConsultationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const cynologists = await listListedCynologists();

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>Консультации с кинологом</h1>
      <div className={styles.content}>
        <Box sx={{ maxWidth: 960, mx: "auto" }}>
          <ConsultationsSubNav active="catalog" />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3 }}
          >
            Выберите кинолога и свободный слот. После записи тренер подтвердит встречу — на почту
            придут уведомления.
          </Typography>
        </Box>
        <CynologistCatalogCards cynologists={cynologists} />
      </div>
    </main>
  );
}
