"use client";

import { memo } from "react";

import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { getAgeWithMonths, declOfNum, getPetTypeLabel } from "@gafus/core/utils";
import { Avatar, IconButton } from "@shared/utils/muiImports";

import EditablePetAvatar from "../EditablePetAvatar";
import styles from "./PetList.module.css";

import type { PublicProfile } from "@gafus/types";

type PetFromPublicProfile = PublicProfile["pets"][0];

interface PetCardProps {
  pet: PetFromPublicProfile;
  isOwner: boolean;
  onEdit: (pet: PetFromPublicProfile) => void;
  onDelete: (petId: string, petName: string) => void;
  isPending: boolean;
}

const PetCard = memo(function PetCard({
  pet,
  isOwner,
  onEdit,
  onDelete,
  isPending,
}: PetCardProps) {
  return (
    <li className={styles.dog_item}>
      {isOwner ? (
        <div className={styles.avatar_container}>
          <EditablePetAvatar avatarUrl={pet.photoUrl} petId={pet.id} />
        </div>
      ) : (
        <div className={styles.avatar_container}>
          <Avatar
            alt={`${pet.name} фото питомца`}
            src={pet.photoUrl || "/uploads/pet-avatar.jpg"}
          />
        </div>
      )}

      <div className={styles.dog_info}>
        <h3>
          {pet.name} ({getPetTypeLabel(pet.type)})
        </h3>
        <p>Порода: {pet.breed}</p>

        {pet.birthDate &&
          (() => {
            const age = getAgeWithMonths(
              pet.birthDate instanceof Date ? pet.birthDate.toISOString() : pet.birthDate,
            );

            if (age.years === 0) {
              return (
                <p>
                  Возраст: {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                </p>
              );
            }
            return (
              <p>
                Возраст: {age.years} {declOfNum(age.years, ["год", "года", "лет"])}
                {age.months > 0 && (
                  <>
                    {age.months} {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
                  </>
                )}
              </p>
            );
          })()}
        {pet.heightCm && <p>Рост: {pet.heightCm} см</p>}
        {pet.weightKg && <p>Вес: {pet.weightKg} кг</p>}
        {pet.notes && <p>Заметки: {pet.notes}</p>}
      </div>
      {isOwner ? (
        <div className={styles.dog_actions}>
          <IconButton
            onClick={() => onEdit(pet)}
            size="small"
            aria-label="Редактировать питомца"
          >
            <EditRoundedIcon />
          </IconButton>
          <IconButton
            onClick={() => onDelete(pet.id, pet.name)}
            size="small"
            aria-label="Удалить питомца"
            disabled={isPending}
          >
            <DeleteRoundedIcon />
          </IconButton>
        </div>
      ) : null}
    </li>
  );
});

export default PetCard;
