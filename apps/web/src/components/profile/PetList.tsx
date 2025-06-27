"use client";

import dynamic from "next/dynamic";
import { Avatar, IconButton, Modal, Box } from "@mui/material";
import styles from "./PetList.module.css";
import EditablePetAvatar from "@/components/EditableAvatar/EditablePetAvatar";
import DeleteForeverSharpIcon from "@mui/icons-material/DeleteForeverSharp";
import EditSharpIcon from "@mui/icons-material/EditSharp";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { deletePet } from "@/lib/pet/deletePet";

const EditPetForm = dynamic(() => import("./EditPetForm"), {
  ssr: false,
  loading: () => <p>Загрузка формы…</p>,
});
import { Pet } from "@/types/Pet";
import { getAgeWithMonths } from "@/utils/getAgeWithMonths";
import { declOfNum } from "@/utils/pluralize";

const handleDelete = (
  petId: string,
  router: ReturnType<typeof useRouter>,
  startTransition: (callback: () => void) => void,
  isPending: boolean
) => {
  if (isPending) return;
  const confirmDelete = confirm("Удалить этого питомца?");
  if (!confirmDelete) return;

  startTransition(async () => {
    try {
      await deletePet(petId, "/profile");
      router.refresh();
    } catch {
      alert("Ошибка при удалении питомца");
    }
  });
};

export default function PetList({
  pets,
  isOwner,
}: {
  pets: Pet[];
  isOwner: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);

  const handleEditClick = (pet: Pet) => {
    setSelectedPet(pet);
    setShowEdit(true);
  };

  const PetCard = ({ pet }: { pet: Pet }) => (
    <li className={styles.dog_item} key={pet.id}>
      {isOwner ? (
        <EditablePetAvatar
          avatarUrl={pet.photoUrl || "/pet-avatar.jpg"}
          petId={pet.id}
        />
      ) : (
        <Avatar
          alt={`${pet.name} фото питомца`}
          src={pet.photoUrl || "/pet-avatar.jpg"}
          sx={{ width: 50, height: 50 }}
        />
      )}

      <div className={styles.dog_info}>
        <h3>
          {pet.name} ({pet.type})
        </h3>
        <p>Порода: {pet.breed}</p>

        {(() => {
          const age = getAgeWithMonths(pet.birthDate);
          return (
            <p>
              Возраст: {age.years}{" "}
              {declOfNum(age.years, ["год", "года", "лет"])}
              {age.months > 0 && (
                <>
                  {age.months}{" "}
                  {declOfNum(age.months, ["месяц", "месяца", "месяцев"])}
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
            onClick={() =>
              handleDelete(pet.id, router, startTransition, isPending)
            }
            disabled={isPending}
          >
            <DeleteForeverSharpIcon />
          </IconButton>
          <IconButton onClick={() => handleEditClick(pet)}>
            <EditSharpIcon />
          </IconButton>
        </div>
      ) : null}
      {pet.awards.length > 0 && (
        <>
          <h4>Награды:</h4>
          <ul>
            {pet.awards.map((award) => (
              <li key={award.id}>
                {award.title} — {award.event} (
                {new Date(award.date).toLocaleDateString()})
                {award.rank && `, место: ${award.rank}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );

  if (!pets.length) return <p>Нет зарегистрированных питомцев</p>;

  return (
    <section>
      <h2>Питомцы</h2>
      <ul className={styles.dog_list}>
        {pets.map((pet) => (
          <PetCard key={pet.id} pet={pet} />
        ))}
      </ul>
      <Modal open={showEdit} onClose={() => setShowEdit(false)}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 4,
            borderRadius: 1,
            maxWidth: 400,
            width: "90%",
          }}
        >
          {selectedPet && (
            <EditPetForm
              pet={selectedPet}
              onClose={() => setShowEdit(false)}
              onSave={() => {
                setShowEdit(false);
                router.refresh(); // обновляет всю страницу
              }}
            />
          )}
        </Box>
      </Modal>
    </section>
  );
}
