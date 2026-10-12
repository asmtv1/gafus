import { ProfileAnalyticsLink } from "@shared/components/analytics/ProfileAnalyticsLink";

import { ProfileIcon } from "../ProfileIcon";
import styles from "./Bio.module.css";
import { primaryButtonClassName } from "@/shared/components/ui";
import EditableAvatar from "../EditableAvatar";
import ProfileAvatar from "../ProfileAvatar";
import TrainerCoursesSection from "../TrainerCoursesSection";

import type { BioProps } from "../../types";

import { getAge, declOfNum } from "@gafus/core/utils";
import { USER_EMAIL_MISSING_HINT } from "@gafus/types";
import { getTelegramUrl, getInstagramUrl } from "@gafus/core/utils/social";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { InstagramIcon, TelegramIcon, WebsiteIcon } from "../SocialIcons";

export default function Bio({ publicData, isOwner, username, userData }: BioProps) {
  const profile = publicData.profile as
    | (NonNullable<typeof publicData.profile> & { city?: string | null })
    | null;
  const diplomas = publicData.diplomas;
  const safeWebsite = profile?.website?.startsWith("http") ? profile.website : null;
  const city = profile?.city?.trim() || null;
  const age = profile?.birthDate ? getAge(profile.birthDate) : null;

  const displayRole =
    publicData.role && publicData.role !== "USER"
      ? {
          ADMIN: "Администратор",
          MODERATOR: "Модератор",
          TRAINER: "Кинолог",
          PARTNER: "Партнёр",
        }[publicData.role]
      : null;

  const getRoleClass = (role: string) => {
    switch (role) {
      case "ADMIN":
        return styles.admin;
      case "MODERATOR":
        return styles.moderator;
      case "TRAINER":
        return styles.trainer;
      default:
        return "";
    }
  };

  const profileEmpty = !profile || Object.values(profile).every((v) => v == null);
  const diplomasEmpty = diplomas.length === 0;
  const showEmptyNotice = profileEmpty && diplomasEmpty;
  const profilePathOrScreen = username
    ? `/profile?username=${encodeURIComponent(username)}`
    : "/profile";

  return (
    <section className={styles.wrapper} aria-label="Профиль пользователя">
      <div className={styles.profileBanner}>
        <div className={styles.avatarContainer}>
          {isOwner ? (
            <EditableAvatar avatarUrl={profile?.avatarUrl || "/uploads/avatar.svg"} />
          ) : (
            <ProfileAvatar avatarUrl={profile?.avatarUrl || null} alt="Profile picture" size={80} />
          )}
        </div>
        <div className={styles.profileInfo}>
          <h1 className={styles.greeting}>{profile?.fullName || username}</h1>
          <div className={styles.identityMeta}>
            <span className={styles.username}>@{username}</span>
            <span className={styles.metaSeparator} aria-hidden="true">·</span>
            <span
              className={`${styles.contactInfo}${
                isOwner && !userData?.email?.trim() ? ` ${styles.contactInfoMissing}` : ""
              }`}
            >
              {isOwner
                ? userData?.email?.trim()
                  ? userData.email.trim()
                  : USER_EMAIL_MISSING_HINT
                : profile?.telegram
                  ? `@${profile.telegram}`
                  : "Контакты не указаны"}
            </span>
          </div>
          {(displayRole || isOwner) && (
            <div className={styles.identityActions}>
              {displayRole && (
                <span className={`${styles.roleBadge} ${getRoleClass(publicData.role!)}`}>
                  {displayRole}
                </span>
              )}
              {isOwner && (
                <ProfileAnalyticsLink
                  className={`${styles.editBioButton} ${styles.buttonLink} ${primaryButtonClassName}`}
                  elementId="profile-bio-edit-link-click"
                  href="/profile/editBio"
                  pathOrScreen={profilePathOrScreen}
                >
                  Редактировать профиль
                </ProfileAnalyticsLink>
              )}
            </div>
          )}
        </div>
        {/* Социальные сети */}
        {(profile?.instagram || profile?.telegram || safeWebsite) && (
          <div className={styles.socialLinksContainer}>
            <div className={styles.socialLinksList}>
              {profile?.instagram && (
                <a
                  href={getInstagramUrl(profile.instagram)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`Открыть Instagram профиль ${profile.instagram} в новой вкладке`}
                  className={`${styles.socialLink} ${styles.socialLinkInstagram}`}
                >
                  <InstagramIcon className={styles.socialIcon} />
                  <span className={styles.socialLabel}>Instagram</span>
                  <span className={styles.socialUsername}>{profile.instagram}</span>
                </a>
              )}
              {profile?.telegram && (
                <a
                  href={getTelegramUrl(profile.telegram)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`Открыть Telegram профиль ${profile.telegram} в новой вкладке`}
                  className={`${styles.socialLink} ${styles.socialLinkTelegram}`}
                >
                  <TelegramIcon className={styles.socialIcon} />
                  <span className={styles.socialLabel}>Telegram</span>
                  <span className={styles.socialUsername}>{profile.telegram}</span>
                </a>
              )}
              {safeWebsite && (
                <a
                  href={safeWebsite}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`Открыть сайт ${safeWebsite} в новой вкладке`}
                  className={`${styles.socialLink} ${styles.socialLinkWebsite}`}
                >
                  <WebsiteIcon className={styles.socialIcon} />
                  <span className={styles.socialLabel}>Сайт</span>
                  <span className={styles.socialUsername}>{safeWebsite}</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.detailsGrid}>
        <div className={styles.descriptionColumn}>
          {(age !== null || city || isOwner) && (
            <div className={styles.personalFacts} aria-label="Личные сведения">
              {(age !== null || isOwner) && (
                <div className={styles.personalFact}>
                  <span className={styles.factLabel}>Возраст</span>
                  <span className={styles.factValue}>
                    {age !== null ? `${age} ${declOfNum(age, ["год", "года", "лет"])}` : "Не указан"}
                  </span>
                </div>
              )}
              {(city || isOwner) && (
                <div className={styles.personalFact}>
                  <span className={styles.factLabel}>
                    <LocationOnOutlinedIcon fontSize="inherit" aria-hidden="true" /> Город
                  </span>
                  <span className={city ? styles.factValue : styles.factMissing}>
                    {city || "Не указан"}
                  </span>
                </div>
              )}
            </div>
          )}
          {profile?.about && (
            <div className={styles.aboutBlock}>
              <h2 className={styles.aboutTitle}>
                <ProfileIcon name="about" /> О себе
              </h2>
              <p className={styles.aboutText}>{profile.about}</p>
            </div>
          )}
          {showEmptyNotice && <p className={styles.emptyNotice}>Информация о себе не внесена</p>}
        </div>

      </div>

      {publicData.role === "TRAINER" && <TrainerCoursesSection publicData={publicData} />}
      {diplomas.length > 0 && (
        <div className={styles.diplomasSection}>
          <h2>Дипломы</h2>
          <ul>
            {diplomas.map((diplom) => (
              <li key={diplom.id}>
                {diplom.title}
                {diplom.issuedBy && ` — ${diplom.issuedBy}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
