import Image from "next/image";

import { getCDNUrl } from "@gafus/cdn-upload";
import { cynologistDisplayInitials, type ListedCynologistCardDto } from "@gafus/consultation-shared";
import { CaramelButtonLink, PrimaryButtonLink } from "@/shared/components/ui";
import { profilePagePath } from "@/shared/lib/profile/profilePagePath";

import styles from "./cynologist-catalog-cards.module.css";

interface CynologistCatalogCardsProps {
  cynologists: ListedCynologistCardDto[];
}

const LANA_CYNOLOGIST_USER_ID = "cmhq7qk2s0000nn01jr2ptnil";

function resolveAvatarUrl(avatarUrl: string | null): string | null {
  if (!avatarUrl?.trim()) {
    return null;
  }
  return avatarUrl.startsWith("http") ? avatarUrl : getCDNUrl(avatarUrl);
}

/** Карточки каталога: тот же набор сведений и действий, что в мобильном приложении. */
export function CynologistCatalogCards({ cynologists }: CynologistCatalogCardsProps) {
  if (cynologists.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Пока нет доступных кинологов для записи. Загляните позже.</p>
      </div>
    );
  }

  return (
    <section
      className={styles.catalog}
      aria-labelledby="consultations-catalog-title"
      data-tour-target="consultations-list"
    >
      <div className={styles.catalogHeading}>
        <h2 className={styles.catalogTitle} id="consultations-catalog-title">
          Доступные специалисты
        </h2>
        <p className={styles.catalogCaption}>Выберите того, с кем хотите обсудить питомца</p>
      </div>
      <ul className={styles.list}>
        {cynologists.map((c, index) => {
          const src = resolveAvatarUrl(c.avatarUrl);
          const title = c.displayName ?? "Кинолог";

          return (
            <li
              key={c.id}
              className={styles.card}
              data-tour-target={index === 0 ? "consultations-first-card" : undefined}
            >
              <div className={styles.cardInner}>
                <div className={styles.avatarFrame}>
                  {src ? (
                    <Image
                      src={src}
                      alt={`Фото: ${title}`}
                      width={88}
                      height={88}
                      className={styles.avatar}
                      unoptimized={src.startsWith("http")}
                    />
                  ) : (
                    <span className={styles.avatarPlaceholder} aria-hidden>
                      {cynologistDisplayInitials(c.displayName)}
                    </span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.name}>{title}</h3>
                  {c.userId === LANA_CYNOLOGIST_USER_ID && (
                    <div className={styles.badges}>
                      <span className={styles.badge}>Составитель курсов</span>
                      <span className={styles.badge}>Главный кинолог проекта</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.meta}>
                <span>Длительность слота: {c.slotDurationMin} мин.</span>
                <span>Часовой пояс: МСК (UTC+3)</span>
              </div>
              <div className={styles.actions}>
                <CaramelButtonLink
                  href={profilePagePath(c.username)}
                  className={styles.action}
                  aria-label={`Подробнее о кинологе ${title}`}
                >
                  Подробнее о кинологе
                </CaramelButtonLink>
                <PrimaryButtonLink
                  href={`/consultations/${encodeURIComponent(c.userId)}`}
                  className={styles.action}
                  aria-label={`Выбрать время у кинолога ${title}`}
                >
                  Выбрать время <span aria-hidden="true">→</span>
                </PrimaryButtonLink>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
