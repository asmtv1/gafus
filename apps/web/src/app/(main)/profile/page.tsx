import { getIsOwner } from "@gafus/auth/server";
import { getPublicProfile } from "@shared/lib/profile/getPublicProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { notFound } from "next/navigation";

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
  const params = await searchParams;
  const username = params?.username;

  if (!username) {
    notFound();
  }

  try {
    const [isOwner, publicData] = await Promise.all([
      getIsOwner(username),
      getPublicProfile(username),
    ]);

    if (!publicData) {
      notFound();
    }

    const userData: UserWithTrainings | null = isOwner
      ? await getUserWithTrainings()
      : null;

    return (
      <ProfileClient
        publicData={publicData}
        isOwner={isOwner}
        username={username}
        userData={userData}
      />
    );
  } catch (error) {
    // Логируем ошибку для отладки, но не выбрасываем её дальше,
    // чтобы избежать бесконечных циклов ререндеринга
    console.error("Ошибка при загрузке профиля:", error);
    notFound();
  }
}
