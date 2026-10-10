"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VisibilityOffOutlined, VisibilityOutlined } from "@mui/icons-material";
import { reportClientError } from "@gafus/error-handling";
import { updatePet } from "@shared/lib/pets/updatePet";

import styles from "./PetList.module.css";

export default function PetProfileVisibility({
  petId,
  petName,
  showInProfile,
}: {
  petId: string;
  petName: string;
  showInProfile: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(showInProfile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!busy.current) setChecked(showInProfile);
  }, [showInProfile]);

  const handleChange = async (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    const previous = checked;
    setChecked(next);
    setSaving(true);
    setError(null);
    try {
      const pet = await updatePet({ id: petId, showInProfile: next });
      setChecked(pet.showInProfile);
      router.refresh();
    } catch (cause) {
      setChecked(previous);
      setError("Не удалось сохранить настройку. Попробуйте ещё раз.");
      reportClientError(cause, {
        issueKey: "PetProfileVisibility",
        keys: { operation: "update_visibility" },
      });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className={styles.profileVisibility} aria-busy={saving}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`Показывать в профиле: ${petName}`}
        disabled={saving}
        onClick={() => void handleChange(!checked)}
        className={styles.profileVisibilityLabel}
      >
        {checked
          ? <VisibilityOutlined className={styles.profileVisibilityIcon} aria-hidden="true" />
          : <VisibilityOffOutlined className={styles.profileVisibilityIcon} aria-hidden="true" />}
        <span className={styles.profileVisibilityText}>Показывать в профиле</span>
        <span className={`${styles.profileVisibilityTrack} ${checked ? styles.profileVisibilityTrackActive : ""}`} aria-hidden="true">
          <span className={styles.profileVisibilityThumb} />
        </span>
      </button>
      {error ? <p className={styles.profileVisibilityError} role="alert">{error}</p> : null}
    </div>
  );
}
