import Bio from "@features/profile/components/Bio";
import PrivateProfileSection from "@features/profile/components/PrivateProfileSection";
import SettingsActions from "@features/profile/components/SettingsActions";

import type { PublicProfile, UserWithTrainings } from "@gafus/types";

interface ProfileClientProps {
  publicData: PublicProfile;
  isOwner: boolean;
  username: string;
  userData: UserWithTrainings | null;
}

export default function ProfileClient({
  publicData,
  isOwner,
  username,
  userData,
}: ProfileClientProps) {
  return (
    <main>
      <Bio publicData={publicData} isOwner={isOwner} username={username} userData={userData} />
      {isOwner && userData && <PrivateProfileSection user={userData} />}
      {isOwner && userData && <SettingsActions />}
    </main>
  );
}
