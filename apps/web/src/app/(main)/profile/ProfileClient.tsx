import Bio from "@features/profile/components/Bio";
import PrivateProfileSection from "@features/profile/components/PrivateProfileSection";

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
      <Bio publicData={publicData} isOwner={isOwner} username={username} />
      {isOwner && userData && <PrivateProfileSection user={userData} />}
    </main>
  );
}
