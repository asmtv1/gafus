import Link from "next/link";

import styles from "./Bio.module.css";
import EditableAvatar from "./EditableAvatar";
import NotificationStatus from "./NotificationStatus";
import PetList from "./PetList";

import type { BioProps } from "@gafus/types";

import { getAge, declOfNum } from "@/utils";
import { Avatar } from "@/utils/muiImports";

export default function Bio({ publicData, isOwner, username }: BioProps) {
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
      {isOwner ? (
        <EditableAvatar
          key={Date.now()}
          avatarUrl={profile?.avatarUrl || "/uploads/avatar.svg"}
        />
      ) : (
        <Avatar
          alt="Profile picture"
          src={profile?.avatarUrl || "/uploads/avatar.svg"}
          sx={{ width: 120, height: 120 }}
        />
      )}
      <div className={styles.container}>
        {profile?.fullName && <h1>{profile.fullName}</h1>}
        {displayRole && (
          <div className={`${styles.roleBadge} ${getRoleClass(publicData.role!)}`}>
            {displayRole}
          </div>
        )}
        {profile?.birthDate && (
          <p>
            Возраст: {getAge(profile.birthDate)}{" "}
            {declOfNum(getAge(profile.birthDate), ["год", "года", "лет"])}
          </p>
        )}
        {profile?.about && <p>О себе: {profile.about}</p>}
        {profile?.instagram && <p>Instagram: {profile.instagram}</p>}
        {profile?.telegram && <p>Telegram: {profile.telegram}</p>}
        {profile?.website && <p>YouTube или сайт: {profile.website}</p>}
        {showEmptyNotice && <div className={styles.emptyNotice}>Информация о себе не внесена</div>}

        {isOwner && (
          <button>
            <Link href="/profile/editBio">Внести/Изменить «О себе»</Link>
          </button>
        )}

        {isOwner && <NotificationStatus />}

        <PetList
          pets={pets.map((pet) => ({
            ...pet,
            birthDate: pet.birthDate || new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          }))}
          isOwner={isOwner}
        />

        {isOwner && (
          <button className={styles.addpet}>
            <Link href="/profile/addPet">Добавить питомца</Link>
          </button>
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
      </div>
    </section>
  );
}
