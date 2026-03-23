import { Alert } from "@mui/material";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { notFound } from "next/navigation";

import { getPreventionEntries } from "@shared/lib/pet-prevention";
import { PreventionEntryList } from "@/features/pet-prevention/components";

import styles from "./prevention-page.module.css";

export const metadata = generateStaticPageMetadata(
  "Записи о процедурах",
  "Прививки, глистогонка, обработки от клещей и блох — с напоминаниями.",
  "/profile/pets/prevention",
);

export default async function PreventionPage({
  params,
}: {
  params: Promise<{ petId: string }>;
}) {
  const { petId } = await params;

  const entries = await getPreventionEntries(petId);

  if (entries === null) {
    notFound();
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Записи о процедурах</h1>
      <Alert severity="info" className={styles.alert}>
        Данные носят справочный характер и не заменяют консультацию ветеринара.
      </Alert>
      <PreventionEntryList entries={entries} petId={petId} />
    </div>
  );
}
