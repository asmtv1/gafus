"use client";

import { reportClientError } from "@gafus/error-handling";
import { Avatar } from "@shared/utils/muiImports";

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
    reportClientError(new Error("Avatar load failed"), {
      issueKey: "ProfileAvatar",
      keys: { hasUrl: !!avatarUrl },
      severity: "warning",
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
