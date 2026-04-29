import Image from "next/image";
import Link from "next/link";

import { getCDNUrl } from "@gafus/cdn-upload";
import {
  cynologistDisplayInitials,
  plainConsultationAboutHtml,
  type ListedCynologistCardDto,
} from "@gafus/consultation-shared";

import styles from "./cynologist-catalog-cards.module.css";

interface CynologistCatalogCardsProps {
  cynologists: ListedCynologistCardDto[];
}

function resolveAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl?.trim()) {
    return null;
  }
  return avatarUrl.startsWith("http") ? avatarUrl : getCDNUrl(avatarUrl);
}

/**
 * Сетка карточек кинологов для страницы /consultations (аватар и описание из профиля).
 */
export function CynologistCatalogCards({ cynologists }: CynologistCatalogCardsProps) {
  if (cynologists.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Пока нет доступных кинологов для записи. Загляните позже.</p>
      </div>
    );
  }

  return (
    <section className={styles.catalog} aria-labelledby="consultations-catalog-title">
      <h2 className={styles.catalogTitle} id="consultations-catalog-title">
        Кинологи
      </h2>
      <ul className={styles.list}>
        {cynologists.map((c) => {
          const src = resolveAvatarUrl(c.avatarUrl);
          const about = plainConsultationAboutHtml(c.about);
          const title = c.displayName ?? "Кинолог";

          return (
            <li key={c.id} className={styles.card}>
              <Link
                href={`/consultations/${c.userId}`}
                className={styles.link}
                aria-label={`${title}, запись на консультацию`}
              >
                <div className={styles.avatarSection}>
                  <div className={styles.avatarFrame}>
                    {src ? (
                      <Image
                        src={src}
                        alt={`Фото: ${title}`}
                        width={96}
                        height={96}
                        className={styles.avatar}
                        unoptimized={src.startsWith("http")}
                      />
                    ) : (
                      <span className={styles.avatarPlaceholder} aria-hidden>
                        {cynologistDisplayInitials(c.displayName)}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.body}>
                  <h3 className={styles.name}>{title}</h3>
                  {about ? (
                    <p className={styles.about}>{about}</p>
                  ) : (
                    <p className={`${styles.about} ${styles.aboutEmpty}`}>
                      Описание появится, когда кинолог заполнит профиль.
                    </p>
                  )}
                  <div className={styles.meta}>
                    <div className={styles.metaRow}>
                      <span>Длительность слота: {c.slotDurationMin} мин.</span>
                      <span>Часовой пояс: МСК (UTC+3)</span>
                    </div>
                    <span className={styles.cta}>Выбрать слот →</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
