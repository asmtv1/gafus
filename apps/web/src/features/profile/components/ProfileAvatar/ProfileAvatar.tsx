"use client";

import { createWebLogger } from "@gafus/logger";
import { Avatar } from "@shared/utils/muiImports";

const logger = createWebLogger("web-profile-avatar");

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
    logger.warn("Ошибка загрузки аватара", {
      avatarUrl,
      operation: "avatar_load_error",
    });
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
