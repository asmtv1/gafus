import { getIsOwner } from "@gafus/auth/server";
import { getPublicProfile } from "@shared/lib/profile/getPublicProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { generateStaticPageMetadata } from "@gafus/metadata";

import ProfileClient from "./ProfileClient";

import type { UserWithTrainings } from "@gafus/types";

export const metadata = generateStaticPageMetadata(
  "Ваш профиль",
  "Управляйте своим аккаунтом, отслеживайте прогресс тренировок.",
  "/profile"
);

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ username?: string }>;
}) {
  const { username } = await searchParams;
  if (!username) throw new Error("Имя пользователя не указано в URL");

  const isOwner = await getIsOwner(username);
  const publicData = await getPublicProfile(username);
  if (!publicData) throw new Error("Пользователь не найден");

  const userData: UserWithTrainings | null = isOwner ? await getUserWithTrainings() : null;

  return (
    <ProfileClient
      publicData={publicData}
      isOwner={isOwner}
      username={username}
      userData={userData}
    />
  );
}
