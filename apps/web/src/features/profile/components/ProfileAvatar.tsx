"use client";

import { Avatar } from "@/utils/muiImports";

interface ProfileAvatarProps {
  avatarUrl: string | null;
  alt?: string;
  size?: number;
}

export default function ProfileAvatar({
  avatarUrl,
  alt = "Profile picture",
  size = 80,
}: ProfileAvatarProps) {
  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.warn("Ошибка загрузки аватара:", e);
    // Fallback на заглушку при ошибке
    e.currentTarget.src = "/uploads/avatar.svg";
  };

  return (
    <Avatar
      alt={alt}
      src={avatarUrl || "/uploads/avatar.svg"}
      sx={{ width: size, height: size }}
      imgProps={{
        onError: handleError,
      }}
    />
  );
}
