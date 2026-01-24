"use client";

import EditIcon from "@mui/icons-material/Edit";
import { updateAvatar } from "@shared/lib/profile/updateAvatar";
import { createWebLogger } from "@gafus/logger";
import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRef, useState, useEffect } from "react";

import { Avatar, Box, IconButton, Tooltip } from "@shared/utils/muiImports";

// Создаем логгер для EditableAvatar
const logger = createWebLogger("web-editable-avatar");

export default function EditableAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(avatarUrl);
  const [imageError, setImageError] = useState(false);

  const [cacheBuster, setCacheBuster] = useState("");
  const [_error, setError] = useState<Error | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;
    if (file.size > MAX_FILE_SIZE) {
      alert("Файл слишком большой. Максимальный размер — 5 МБ.");
      return;
    }

    try {
      const compressedFileRaw = await imageCompression(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      });

      // Create a new File with the original file name
      const compressedFile = new File([compressedFileRaw], file.name, {
        type: compressedFileRaw.type,
      });

      const newUrl = await updateAvatar(compressedFile);
      setCurrentAvatarUrl(newUrl);
      setCacheBuster(Date.now().toString());
      router.refresh();
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Unknown error");
      logger.error("Ошибка при сохранении avatar", errorObj, {
        operation: "save_avatar_error",
        userId: session?.user?.id,
      });
      setError(errorObj);
    }
  };

  useEffect(() => {
    if (currentAvatarUrl) {
      setCacheBuster(Date.now().toString());
    }
  }, [currentAvatarUrl]);

  const displayedUrl =
    currentAvatarUrl && !imageError
      ? cacheBuster
        ? `${currentAvatarUrl}?cb=${cacheBuster}`
        : currentAvatarUrl
      : "/uploads/avatar.svg";

  const handleImageError = () => {
    logger.warn("Ошибка загрузки аватара", {
      operation: "avatar_load_error",
      avatarUrl: currentAvatarUrl,
      displayedUrl,
    });
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageError(false);
  };

  return (
    <>
      <Box
        sx={{
          position: "relative",
          display: "inline-block",
          width: 120,
          height: 120,
        }}
      >
        <Avatar
          alt="Аватар"
          src={displayedUrl}
          sx={{ width: 120, height: 120 }}
          imgProps={{
            onError: handleImageError,
            onLoad: handleImageLoad,
          }}
        />
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
      </Box>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </>
  );
}
