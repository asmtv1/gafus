import Link from "next/link";

import Bio from "@features/profile/components/Bio";
import PrivateProfileSection from "@features/profile/components/PrivateProfileSection";
import SettingsActions from "@features/profile/components/SettingsActions";
import StudentNotes from "@features/profile/components/StudentNotes";

import type { PublicProfile, UserWithTrainings } from "@gafus/types";

import styles from "./profile.module.css";

interface ProfileClientProps {
  publicData: PublicProfile;
  isOwner: boolean;
  username: string;
  userData: UserWithTrainings | null;
  linkFeedback?: string;
}

export default function ProfileClient({
  publicData,
  isOwner,
  username,
  userData,
  linkFeedback,
}: ProfileClientProps) {
  return (
    <main>
      <Bio publicData={publicData} isOwner={isOwner} username={username} userData={userData} />
      {isOwner && publicData.role === "USER" && <StudentNotes />}
      {isOwner && userData && <PrivateProfileSection user={userData} />}
      {isOwner && (
        <Link href="/achievements" className={styles.achievementsLink}>
          🏆 Достижения →
        </Link>
      )}
      {isOwner && userData && (
        <SettingsActions
          hasVkLinked={userData.hasVkLinked ?? false}
          linkFeedback={linkFeedback}
        />
      )}
    </main>
  );
}
