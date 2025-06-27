import PetList from "./PetList";
import { Avatar } from "@mui/material";
import Link from "next/link";
import EditableAvatar from "@/components/EditableAvatar/EditableAvatar";
import styles from "./Bio.module.css";
import type { PublicProfile } from "@/types/user";
import { getAge } from "@/utils/getAge";
import { declOfNum } from "@/utils/pluralize";

interface BioProps {
  publicData: PublicProfile;
  isOwner: boolean;
}

export default function Bio({ publicData, isOwner }: BioProps) {
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

  const profileEmpty =
    !profile || Object.values(profile).every((v) => v == null);
  const diplomasEmpty = diplomas.length === 0;
  const showEmptyNotice = profileEmpty && diplomasEmpty;

  return (
    <section className={styles.container}>
      {isOwner ? (
        <EditableAvatar
          key={Date.now()}
          avatarUrl={profile?.avatarUrl || "/avatar.svg"}
        />
      ) : (
        <Avatar
          alt="Profile picture"
          src={profile?.avatarUrl || "/avatar.svg"}
          sx={{ width: 120, height: 120 }}
        />
      )}

      {profile?.fullName && <h1>{profile.fullName}</h1>}
      {displayRole && <div style={{ color: "red" }}>{displayRole}</div>}
      {profile?.birthDate && (
        <p>
          Возраст: {getAge(profile.birthDate)}{" "}
          {declOfNum(getAge(profile.birthDate), ["год", "года", "лет"])}
        </p>
      )}
      {profile?.about && <p>О себе: {profile.about}</p>}
      {profile?.instagram && <p>Instagram: {profile.instagram}</p>}
      {profile?.telegram && <p>Telegram: {profile.telegram}</p>}
      {showEmptyNotice && <div>Информация о себе не внесена</div>}

      {isOwner && (
        <button>
          <Link href={`/profile/editBio?userId=${publicData.username}`}>
            Внести/Изменить «О себе»
          </Link>
        </button>
      )}

      <PetList
        pets={pets.map((pet) => ({
          ...pet,
          birthDate: pet.birthDate?.toISOString() ?? "",
          awards: pet.awards.map((award) => ({
            ...award,
            date: award.date?.toISOString() ?? "",
            event: award.event ?? "",
          })),
        }))}
        isOwner={isOwner}
      />

      {isOwner && (
        <button className={styles.addpet}>
          <Link href={`/profile/addPet?userId=${publicData.username}`}>
            Добавить питомца
          </Link>
        </button>
      )}

      {diplomas.length > 0 && (
        <>
          <h2>Diplomas</h2>
          <ul>
            {diplomas.map((d) => (
              <li key={d.id}>
                {d.title}
                {d.issuedBy && ` — ${d.issuedBy}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
