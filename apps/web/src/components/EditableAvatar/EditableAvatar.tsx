"use client";

import { Avatar, Box, IconButton, Tooltip } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useRef, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { updateAvatar } from "@/lib/profile/updateAvatar";
import imageCompression from "browser-image-compression";
import { useRouter } from "next/navigation";

export default function EditableAvatar({
  avatarUrl,
}: {
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(
    avatarUrl
  );

  const [cacheBuster, setCacheBuster] = useState("");
  const [error, setError] = useState<Error | null>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;
    console.log("Загрузка начинается:", file.name, file.size);
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
      console.error("Ошибка при сохранении avatar:", errorObj);
      setError(errorObj);
    }
  };

  useEffect(() => {
    if (currentAvatarUrl) {
      setCacheBuster(Date.now().toString());
    }
  }, [currentAvatarUrl]);

  const displayedUrl = currentAvatarUrl
    ? cacheBuster
      ? `${currentAvatarUrl}?cb=${cacheBuster}`
      : currentAvatarUrl
    : "/avatar.svg";

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
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          accept="image/*"
          hidden
          onChange={handleChange}
        />
      </Box>
      {error && (
        <p style={{ color: "red", marginTop: 8 }}>
          Ошибка при загрузке аватара: {error.message}
        </p>
      )}
    </>
  );
}
