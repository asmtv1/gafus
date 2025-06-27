import styles from "./profile.module.css";
import Bio from "@/components/profile/Bio";
import PrivateProfileSection from "@/components/profile/PrivateProfileSection";
import { getPublicProfile } from "@/lib/profile/getPublicProfile";
import { getUserWithTrainings } from "@/lib/user/getUserWithTrainings";
import { getAuthoredCourses } from "@/lib/course/getAuthoredCourses";
import { getIsOwner } from "@/lib/auth/getIsOwner";
import type { UserWithTrainings } from "@gafus/types";
import type { LiteCourse } from "@gafus/types";
export const metadata = {
  title: "Ваш профиль",
  description:
    "Управляйте своим аккаунтом, отслеживайте прогресс и настройки тренировок.",
};
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

  const data: UserWithTrainings | null = isOwner
    ? await getUserWithTrainings()
    : null;
  const createdCourses: LiteCourse[] | null = isOwner
    ? await getAuthoredCourses()
    : null;

  return (
    <main className={styles.container}>
      <h2>Профиль {username}</h2>
      <Bio publicData={publicData} isOwner={isOwner} />
      {isOwner && data && (
        <PrivateProfileSection
          user={data}
          createdCourses={createdCourses || []}
        />
      )}
    </main>
  );
}
