import Link from "next/link";

import styles from "./Bio.module.css";
import EditableAvatar from "./EditableAvatar";
import NotificationStatus from "./NotificationStatus";
import PetList from "./PetList";
import ProfileAvatar from "./ProfileAvatar";
import TrainerCoursesSection from "./TrainerCoursesSection";

import type { BioProps } from "@gafus/types";

import { getAge, declOfNum } from "@gafus/core/utils";
import { getTelegramUrl, getInstagramUrl } from "@gafus/core/utils/social";
import { InstagramIcon, TelegramIcon, WebsiteIcon } from "./SocialIcons";

export default function Bio({ publicData, isOwner, username, userData }: BioProps) {
  const profile = publicData.profile;
  const diplomas = publicData.diplomas;
  const pets = publicData.pets;

  const displayRole =
    publicData.role && publicData.role !== "USER"
      ? {
          ADMIN: "Администратор",
          MODERATOR: "Модератор",
          TRAINER: "Кинолог",
          PREMIUM: "Премиум-пользователь",
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
      case "PREMIUM":
        return styles.premium;
      default:
        return "";
    }
  };

  const profileEmpty = !profile || Object.values(profile).every((v) => v == null);
  const diplomasEmpty = diplomas.length === 0;
  const showEmptyNotice = profileEmpty && diplomasEmpty;

  return (
    <section className={styles.wrapper}>
      <h2>Профиль {username}</h2>
      
      {/* Новый дизайн в стиле баннера */}
      <div className={styles.profileBanner}>
        <div className={styles.avatarContainer}>
          {isOwner ? (
            <EditableAvatar
              avatarUrl={profile?.avatarUrl || "/uploads/avatar.svg"}
            />
          ) : (
            <ProfileAvatar
              avatarUrl={profile?.avatarUrl || null}
              alt="Profile picture"
              size={80}
            />
          )}
        </div>
        <div className={styles.profileInfo}>
          <div className={styles.greeting}>
            {isOwner ? `Привет, ${profile?.fullName || username}!` : profile?.fullName || username}
          </div>
          <div className={styles.contactInfo}>
            {isOwner && userData?.phone 
              ? `${userData.phone}` 
              : profile?.telegram 
                ? `@${profile.telegram}` 
                : "Контакты не указаны"}
          </div>
          {displayRole && (
          <div className={`${styles.roleBadge} ${getRoleClass(publicData.role!)}`}>
            {displayRole}
          </div>
        )}
        </div>
      </div>

      <div className={styles.container}>
       
        {profile?.birthDate && (
          <p>
            Возраст: {getAge(profile.birthDate)}{" "}
            {declOfNum(getAge(profile.birthDate), ["год", "года", "лет"])}
          </p>
        )}
        {profile?.about && <p>О себе: {profile.about}</p>}
        
        {/* Социальные сети */}
        {(profile?.instagram || profile?.telegram || profile?.website) && (
          <div className={styles.socialLinksContainer}>
            <h3 className={styles.socialLinksTitle}>Контакты</h3>
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
              {profile?.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`Открыть сайт ${profile.website} в новой вкладке`}
                  className={`${styles.socialLink} ${styles.socialLinkWebsite}`}
                >
                  <WebsiteIcon className={styles.socialIcon} />
                  <span className={styles.socialLabel}>Сайт</span>
                  <span className={styles.socialUsername}>{profile.website}</span>
                </a>
              )}
            </div>
          </div>
        )}
        {showEmptyNotice && <div className={styles.emptyNotice}>Информация о себе не внесена</div>}

        {isOwner && (
          <Link className={`${styles.editBioButton} ${styles.buttonLink}`} href="/profile/editBio">
            Внести/Изменить «О себе»
          </Link>
        )}
         </div>
        
        <div className={styles.petList}>
        <PetList
          pets={pets}
          isOwner={isOwner}
        />

        {isOwner && (
          <Link className={`${styles.editBioButton} ${styles.addpet}`} href="/profile/addPet">
            Добавить питомца
          </Link>
        )}
</div>
        {publicData.role === "TRAINER" && (
          <TrainerCoursesSection publicData={publicData} />
        )}
        {isOwner && (
          <div className={styles.notificationStatus}>
            <NotificationStatus />
          </div>
        )}
        {diplomas.length > 0 && (
          <div className={styles.diplomasSection}>
            <h2>Diplomas</h2>
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
