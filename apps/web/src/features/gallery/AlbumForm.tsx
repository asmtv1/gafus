"use client";
import { useState } from "react";
import { Button, Checkbox, FormControlLabel, TextField } from "@mui/material";
import { GALLERY_LIMITS, type GalleryAlbumDto, type GalleryAlbumCreateInput } from "@gafus/types";
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
      <div className={styles.actions}>
        <TextField
          fullWidth
          label="Название альбома"
          value={name}
          required
          inputProps={{ maxLength: GALLERY_LIMITS.albumName }}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          fullWidth
          multiline
          label="Описание (необязательно)"
          value={description}
          inputProps={{ maxLength: GALLERY_LIMITS.caption }}
          helperText={`До ${GALLERY_LIMITS.caption} символов`}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FormControlLabel
          control={<Checkbox checked={isVisible} onChange={(e) => setVisible(e.target.checked)} />}
          label="Виден всем авторизованным"
        />
        <p className={styles.muted}>
          Если снять отметку, альбом и фотографии будут доступны только вам.
        </p>
        <Button type="submit" variant="contained" disabled={busy || !name.trim()}>
          Сохранить
        </Button>
        <Button onClick={cancel} disabled={busy}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
