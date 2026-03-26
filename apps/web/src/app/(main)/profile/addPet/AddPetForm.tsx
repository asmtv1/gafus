"use client";

import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller } from "react-hook-form";
import { useSession } from "next-auth/react";

import { reportClientError } from "@gafus/error-handling";
import { useCaughtError } from "@shared/hooks/useCaughtError";
import { useCreatePetZodForm } from "@shared/hooks/usePetZodForm";
import { savePet } from "@shared/lib/pets/savePet";
import { clearProfilePageCache } from "@shared/utils/clearProfileCache";

import type { PetFormSchema } from "@shared/lib/validation/petSchemas";

import styles from "./AddPetForm.module.css";

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    backgroundColor: "#fff",
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#636128",
    borderWidth: "1px",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#4a4a1a",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#636128",
    borderWidth: "2px",
  },
  "& .MuiInputLabel-root": {
    color: "#5a5744",
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
  "& .MuiFormHelperText-root": {
    fontFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
} as const;

export default function AddPetForm() {
  const [catchError] = useCaughtError();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const { form, handleSubmit, formState: { errors } } = useCreatePetZodForm();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const onSubmit = async (data: PetFormSchema) => {
    setIsSubmitting(true);
    try {
      const { photoUrl: _photoUrl, ...petData } = data;
      await savePet({
        ...petData,
        id: "",
      });
      const username = session?.user?.username ?? null;
      await clearProfilePageCache(username);
      if (username) {
        router.push(`/profile?username=${username}`);
      } else {
        router.back();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      reportClientError(error, { issueKey: "ProfilePets", keys: { operation: "submit" } });
      catchError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const rName = form.register("name");
  const rBreed = form.register("breed");
  const rBirth = form.register("birthDate");
  const rHeight = form.register("heightCm");
  const rWeight = form.register("weightKg");
  const rNotes = form.register("notes");

  if (!isMounted) {
    return (
      <main className={styles.page}>
        <section className={styles.card} aria-busy>
          <p className={styles.loadingHint}>Загрузка формы…</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="add-pet-title">
        <div className={styles.iconWrap} aria-hidden>
          <PetsOutlinedIcon sx={{ fontSize: 28 }} />
        </div>
        <h1 id="add-pet-title" className={styles.title}>
          Добавить питомца
        </h1>
        <p className={styles.lead}>
          Заполните данные о питомце. Дату рождения укажите как ДД.ММ.ГГГГ (например, 15.03.2020).
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <p className={styles.sectionTitle}>Основная информация</p>
          <div className={styles.fields}>
            <TextField
              id="name"
              label="Имя питомца"
              placeholder="Кличка"
              autoComplete="off"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.name}
              helperText={errors.name?.message}
              inputRef={rName.ref}
              name={rName.name}
              onBlur={rName.onBlur}
              onChange={rName.onChange}
              sx={textFieldSx}
            />
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <TextField
                  {...field}
                  id="type"
                  label="Тип питомца"
                  select
                  fullWidth
                  disabled={isSubmitting}
                  error={!!errors.type}
                  helperText={errors.type?.message}
                  value={field.value ?? "DOG"}
                  sx={textFieldSx}
                >
                  <MenuItem value="DOG">Собака</MenuItem>
                  <MenuItem value="CAT">Кошка</MenuItem>
                </TextField>
              )}
            />
            <TextField
              id="breed"
              label="Порода"
              placeholder="Например, лабрадор"
              autoComplete="off"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.breed}
              helperText={errors.breed?.message}
              inputRef={rBreed.ref}
              name={rBreed.name}
              onBlur={rBreed.onBlur}
              onChange={rBreed.onChange}
              sx={textFieldSx}
            />
            <TextField
              id="birthDate"
              label="Дата рождения"
              placeholder="ДД.ММ.ГГГГ"
              autoComplete="bday"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.birthDate}
              helperText={errors.birthDate?.message ?? "Формат: ДД.ММ.ГГГГ"}
              inputRef={rBirth.ref}
              name={rBirth.name}
              onBlur={rBirth.onBlur}
              onChange={rBirth.onChange}
              sx={textFieldSx}
            />
          </div>

          <p className={styles.sectionTitle}>Физические характеристики</p>
          <div className={styles.fields}>
            <TextField
              id="heightCm"
              label="Рост (см)"
              type="text"
              inputMode="decimal"
              placeholder="Необязательно"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.heightCm}
              helperText={errors.heightCm?.message}
              inputRef={rHeight.ref}
              name={rHeight.name}
              onBlur={rHeight.onBlur}
              onChange={rHeight.onChange}
              sx={textFieldSx}
            />
            <TextField
              id="weightKg"
              label="Вес (кг)"
              type="text"
              inputMode="decimal"
              placeholder="Необязательно"
              fullWidth
              disabled={isSubmitting}
              error={!!errors.weightKg}
              helperText={errors.weightKg?.message}
              inputRef={rWeight.ref}
              name={rWeight.name}
              onBlur={rWeight.onBlur}
              onChange={rWeight.onChange}
              sx={textFieldSx}
            />
          </div>

          <p className={styles.sectionTitle}>Дополнительно</p>
          <div className={styles.fields}>
            <TextField
              id="notes"
              label="Заметки"
              placeholder="По желанию"
              multiline
              minRows={3}
              fullWidth
              disabled={isSubmitting}
              error={!!errors.notes}
              helperText={errors.notes?.message}
              inputRef={rNotes.ref}
              name={rNotes.name}
              onBlur={rNotes.onBlur}
              onChange={rNotes.onChange}
              sx={textFieldSx}
            />
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              {isSubmitting ? "Добавление…" : "Добавить питомца"}
            </button>
            <button
              type="button"
              className={styles.cancel}
              disabled={isSubmitting}
              onClick={() => router.back()}
            >
              Отмена
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
