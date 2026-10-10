import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getIsOwner } from "@gafus/auth/server";
import { createWebLogger } from "@gafus/logger";
import { getPublicProfile } from "@shared/lib/profile/getPublicProfile";
import { getUserWithTrainings } from "@shared/lib/user/getUserWithTrainings";
import { generateStaticPageMetadata } from "@gafus/metadata";
import { prisma } from "@gafus/prisma";
import { notFound, unstable_rethrow } from "next/navigation";

const logger = createWebLogger("web-profile-page");

import ProfileClient from "./ProfileClient";

import type { UserWithTrainings } from "@gafus/types";

export const metadata = generateStaticPageMetadata(
  "Ваш профиль",
  "Управляйте своим аккаунтом, отслеживайте прогресс тренировок.",
  "/profile",
);

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{
    username?: string;
    linked?: string;
    error?: string;
    emailChange?: string;
  }>;
}) {
  const params = await searchParams;
  const username = params?.username || (await getServerSession(authOptions))?.user?.username;
  const linkFeedback = params?.linked
    ? "vk"
    : params?.error
      ? params.error
      : params?.emailChange === "sent"
        ? "emailChangeSent"
        : undefined;

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

    const userData: UserWithTrainings | null = isOwner ? await getUserWithTrainings() : null;
    const userCity = await prisma.user.findUnique({
      where: { username },
      select: { profile: { select: { city: true } } },
    });
    const profileWithCity = {
      ...publicData,
      profile: publicData.profile
        ? { ...publicData.profile, city: userCity?.profile?.city ?? null }
        : null,
    };

    return (
      <ProfileClient
        publicData={profileWithCity}
        isOwner={isOwner}
        username={username}
        userData={userData}
        linkFeedback={linkFeedback}
      />
    );
  } catch (error) {
    unstable_rethrow(error);
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Ошибка при загрузке профиля", err, { username });
    notFound();
  }
}
