import Image from "next/image";
import { formatPetAge, getPetTypeLabel } from "@gafus/core/utils";
import type { PublicPet } from "@gafus/types";

import styles from "./PublicPets.module.css";

export default function PublicPets({ pets }: { pets: PublicPet[] }) {
  if (pets.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Питомцы">
      <h2 className={styles.heading}>Питомцы</h2>
      <ul className={styles.list}>
        {pets.map((pet) => {
          const age = formatPetAge(pet.birthDate);
          return (
            <li key={pet.id} className={styles.card}>
              <Image
                src={pet.photoUrl || (pet.type === "CAT" ? "/images/pet-avatar-cat.png" : "/images/pet-avatar-dog.png")}
                alt={`Питомец ${pet.name}`}
                width={80}
                height={80}
                className={styles.photo}
                unoptimized
              />
              <div className={styles.info}>
                <p className={styles.species}>{getPetTypeLabel(pet.type)}</p>
                <h3 className={styles.name}>{pet.name}</h3>
                <p className={styles.detail}>{pet.breed || "Порода не указана"}</p>
                {age ? <p className={styles.detail}>{age}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
