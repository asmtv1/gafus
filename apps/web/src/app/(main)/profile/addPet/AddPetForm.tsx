"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { savePet } from "@/lib/pet/savePet";
import { PetFormFields } from "@/components/ui/PetFormFields";
import { usePetForm } from "@/hooks/usePetForm";
import type { PetFormData } from "@/types/Pet";

export default function AddPetForm() {
  const [caughtError, setCaughtError] = useState<Error | null>(null);
  if (caughtError) throw caughtError;

  const searchParams = useSearchParams();
  const ownerId = searchParams.get("userId") || "";
  const router = useRouter();

  const form = usePetForm({ ownerId });

  const onSubmit = async (data: PetFormData) => {
    try {
      await savePet({ ...data, ownerId, id: "" });
      window.history.back();
      setTimeout(() => window.location.reload(), 100);
    } catch (err) {
      setCaughtError(err as Error);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} style={{ maxWidth: 400 }}>
      <PetFormFields form={form} />
      <button type="submit" style={{ marginTop: 16 }}>
        Добавить питомца
      </button>
      <button type="button" onClick={() => router.back()}>
        Отмена
      </button>
    </form>
  );
}
