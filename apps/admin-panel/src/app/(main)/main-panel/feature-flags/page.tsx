import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getMobileReleaseControl } from "@gafus/core/services/appFeatureFlags";

import { MobileReleaseControl } from "@/features/admin/components/MobileReleaseControl";
import PageLayout from "@/shared/components/PageLayout";

export default async function FeatureFlagsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const config = await getMobileReleaseControl();

  return (
    <PageLayout
      title="Управление мобильным релизом"
      subtitle="Профили функций для опубликованных и находящихся на ревью версий iOS"
    >
      <MobileReleaseControl actorRole={session.user.role} initialConfig={config} />
    </PageLayout>
  );
}
