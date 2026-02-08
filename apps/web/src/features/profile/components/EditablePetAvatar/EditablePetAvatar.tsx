"use client";

import EditIcon from "@mui/icons-material/Edit";
import { updatePetAvatar } from "@shared/lib/pets/updatePetAvatar";
import { createWebLogger } from "@gafus/logger";
import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRef, useState, useEffect } from "react";

import { Avatar, Box, IconButton, Tooltip } from "@shared/utils/muiImports";

// Создаем логгер для EditablePetAvatar
const logger = createWebLogger("web-editable-pet-avatar");

export default function EditablePetAvatar({
  petId,
  avatarUrl,
}: {
  petId: string;
  avatarUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { data: session } = useSession();

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(avatarUrl);
  const [cacheBuster, setCacheBuster] = useState("");
  const [error, setError] = useState<Error | null>(null);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 МБ

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id || !petId) return;
    if (file.size > MAX_FILE_SIZE) {
      alert("Файл слишком большой. Максимальный размер — 2 МБ.");
      return;
    }

    try {
      const compressedFileRaw = await imageCompression(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      const compressedFile = new File([compressedFileRaw], file.name, {
        type: compressedFileRaw.type,
      });

      const uniqueName = `${petId}-${Date.now()}-${compressedFile.name}`;
      const uniqueFile = new File([compressedFile], uniqueName, {
        type: compressedFile.type,
      });

      const newUrl = await updatePetAvatar(uniqueFile, petId);
      setCurrentAvatarUrl(newUrl);
      setCacheBuster(Date.now().toString());
      router.refresh();
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Unknown error");
      logger.error("Ошибка при сохранении avatar питомца", errorObj, {
        operation: "save_pet_avatar_error",
        petId: petId,
      });
      setError(errorObj);
    }
  };

  useEffect(() => {
    if (currentAvatarUrl) {
      setCacheBuster(Date.now().toString());
    }
  }, [currentAvatarUrl]);

  // Синхронизируем currentAvatarUrl с avatarUrl из пропсов
  useEffect(() => {
    setCurrentAvatarUrl(avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const displayedUrl = currentAvatarUrl
    ? cacheBuster
      ? `${currentAvatarUrl}?cb=${cacheBuster}`
      : currentAvatarUrl
    : "/uploads/pet-avatar.jpg";

  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-block",
        width: 120,
        height: 120,
      }}
    >
      <Avatar alt="Аватар питомца" src={displayedUrl} sx={{ width: 120, height: 120 }} />
      <Tooltip title="Изменить аватар">
        <IconButton
          onClick={() => fileInputRef.current?.click()}
          sx={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "background.paper",
            boxShadow: 1,
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <input
        ref={fileInputRef}
        name="file"
        type="file"
        accept="image/*"
        hidden
        onChange={handleChange}
      />
    </Box>
  );
}
