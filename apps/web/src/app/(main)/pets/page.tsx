import { generateStaticPageMetadata } from "@gafus/metadata";
import { createWebLogger } from "@gafus/logger";
import PetList from "@features/profile/components/PetList";
import { ProfileAnalyticsLink } from "@shared/components/analytics/ProfileAnalyticsLink";
import { getCurrentUserPetsPageData } from "@shared/lib/pets/server";
import { redirect, unstable_rethrow } from "next/navigation";

import styles from "./pets.module.css";

export const dynamic = "force-dynamic";

export const metadata = generateStaticPageMetadata(
  "Питомцы",
  "Управляйте карточками питомцев и их документами.",
  "/pets",
);

const logger = createWebLogger("web-pets-page");

export default async function PetsPage() {
  try {
    const pageData = await getCurrentUserPetsPageData();
    if (!pageData) {
      return (
        <main className={styles.page}>
          <section className={styles.wrapper}>
            <h1 className={styles.title}>Питомцы</h1>
            <p className={styles.emptyText}>Не удалось загрузить питомцев</p>
          </section>
        </main>
      );
    }

    return (
      <main className={styles.page}>
        <section className={styles.wrapper}>
          <h1 className={styles.title}>Питомцы</h1>
          <div className={styles.petList}>
            <PetList
              pets={pageData.pets}
              isOwner
              pathOrScreen="/pets"
              revalidatePath="/pets"
            />
          </div>
          <ProfileAnalyticsLink
            href="/profile/addPet"
            className={styles.addPetButton}
            elementId="pets-add-pet-open"
            pathOrScreen="/pets"
          >
            Добавить питомца
          </ProfileAnalyticsLink>
        </section>
      </main>
    );
  } catch (error) {
    unstable_rethrow(error);
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.message === "Пользователь не авторизован") {
      redirect("/login");
    }

    logger.error("Ошибка загрузки страницы питомцев", err);
    return (
      <main className={styles.page}>
        <section className={styles.wrapper}>
          <h1 className={styles.title}>Питомцы</h1>
          <p className={styles.emptyText}>Не удалось открыть страницу питомцев</p>
        </section>
      </main>
    );
  }
}
