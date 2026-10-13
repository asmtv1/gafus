import { FeedAuthorPostsList } from "@/features/feed/FeedViews";
import { MyQuestionsList } from "@/features/questions/MyQuestionsList";
import {
  Bio,
  NotificationStatus,
  PrivateProfileSection,
  PublicPets,
  SettingsActions,
  StudentNotes,
} from "@/features/profile";

import type { PublicProfile, UserWithTrainings } from "@gafus/types";

import ProfileSections from "./ProfileSections";
import styles from "./profile.module.css";

interface ProfileClientProps {
  publicData: PublicProfile;
  isOwner: boolean;
  username: string;
  userData: UserWithTrainings | null;
  linkFeedback?: string;
  initialView?: "activity" | "questions" | "settings" | "notes";
}

/** Layout only: public identity leads; private account controls are a separate view. */
export default function ProfileClient({
  publicData,
  isOwner,
  username,
  userData,
  linkFeedback,
  initialView = "activity",
}: ProfileClientProps) {
  return (
    <main className={styles.profilePage}>
      <div className={styles.profileShell}>
        <Bio publicData={publicData} isOwner={isOwner} username={username} userData={userData} />

        <ProfileSections
          isOwner={isOwner}
          initialView={initialView}
          questions={isOwner ? <MyQuestionsList /> : undefined}
          notes={
            isOwner ? (
              <div className={styles.notesCard}>
                <StudentNotes />
              </div>
            ) : undefined
          }
          activity={
            <div className={`${styles.activityLayout} ${!isOwner && publicData.pets.length > 0 ? styles.visitorLayout : ""}`}>
              <div className={styles.activityColumns}>
                <FeedAuthorPostsList username={username} pageSize={6} />
              </div>
              {!isOwner && publicData.pets.length > 0 && (
                <aside id="profile-pets" className={styles.petsColumn}>
                  <PublicPets pets={publicData.pets} />
                </aside>
              )}
            </div>
          }
          settings={
            isOwner && userData ? (
              <div className={styles.settingsLayout}>
                <div className={styles.settingsMain}>
                  <SettingsActions
                    hasVkLinked={userData.hasVkLinked ?? false}
                    linkFeedback={linkFeedback}
                    notificationPanel={<NotificationStatus />}
                  />
                </div>
                <aside className={styles.settingsAside} aria-label="Подписка GAFUS">
                  <PrivateProfileSection user={userData} />
                </aside>
              </div>
            ) : undefined
          }
        />
      </div>
    </main>
  );
}
