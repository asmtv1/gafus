import Link from "next/link";
import PublicPets from "@/features/profile/components/PetList/PublicPets";
import { GalleryPreview } from "@/features/gallery";
import { ProfileFeedPreview } from "@/features/feed/ProfileFeedPreview";

import { Bio, PrivateProfileSection, SettingsActions, StudentNotes } from "@/features/profile";

import type { PublicProfile, UserWithTrainings } from "@gafus/types";

import styles from "./profile.module.css";

// The achievements route remains available, but it is not part of the web-profile UI.
const SHOW_ACHIEVEMENTS_LINK = false;

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
      {!isOwner && <PublicPets pets={publicData.pets} />}
      {!isOwner && <GalleryPreview username={username} />}
      <ProfileFeedPreview username={username} />
      {isOwner && publicData.role === "USER" && <StudentNotes />}
      {isOwner && userData && <PrivateProfileSection user={userData} />}
      {SHOW_ACHIEVEMENTS_LINK && isOwner && (
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
