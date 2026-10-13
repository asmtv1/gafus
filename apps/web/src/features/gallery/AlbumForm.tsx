"use client";
import { useState } from "react";
import { Checkbox, FormControlLabel, TextField } from "@mui/material";
import { GALLERY_LIMITS, type GalleryAlbumDto, type GalleryAlbumCreateInput } from "@gafus/types";
import { PrimaryButton, SecondaryButton } from "@/shared/components/ui";
import styles from "./Gallery.module.css";

export function AlbumForm({
  album,
  save,
  cancel,
}: {
  album?: GalleryAlbumDto;
  save: (input: GalleryAlbumCreateInput) => Promise<void>;
  cancel: () => void;
}) {
  const [name, setName] = useState(album?.name ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [isVisible, setVisible] = useState(album?.isVisible ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={styles.albumForm}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await save({ name: name.trim(), description: description.trim() || null, isVisible });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={styles.albumFields}>
        <TextField
          fullWidth
          label="Название альбома"
          value={name}
          required
          inputProps={{ maxLength: GALLERY_LIMITS.albumName }}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          fullWidth
          multiline
          minRows={2}
          label="Описание (необязательно)"
          value={description}
          inputProps={{ maxLength: GALLERY_LIMITS.caption }}
          helperText={`${description.length} / ${GALLERY_LIMITS.caption} символов`}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className={styles.albumVisibility}>
        <FormControlLabel
          control={
            <Checkbox checked={isVisible} onChange={(event) => setVisible(event.target.checked)} />
          }
          label="Виден всем авторизованным"
        />
        <p>Если выключить, альбом и фотографии будут доступны только вам.</p>
      </div>
      <div className={styles.albumFormActions}>
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? "Сохранение…" : album ? "Сохранить изменения" : "Создать альбом"}
        </PrimaryButton>
        <SecondaryButton onClick={cancel} disabled={busy}>
          Отмена
        </SecondaryButton>
      </div>
    </form>
  );
}
