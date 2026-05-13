import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MobileAppFeaturesCard } from "@/features/admin/components/MobileAppFeaturesCard";
import {
  getAppSubscriptionGatingFlag,
  getAppSubscriptionPaywallFlag,
  getMobileIosRuCardPaymentFlag,
  getMobileIosRuCardPaymentHintFlag,
  getMobileVkLoginIosFlag,
} from "@/features/admin/lib/getMobileVkLoginIosFlag";
import PageLayout from "@/shared/components/PageLayout";

export default async function FeatureFlagsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const [
    vkLoginOnIos,
    iosRuCardPaymentHintEnabled,
    iosRuCardPaymentEnabled,
    appSubscriptionPaywallEnabled,
    appSubscriptionGatingEnabled,
  ] = await Promise.all([
    getMobileVkLoginIosFlag(),
    getMobileIosRuCardPaymentHintFlag(),
    getMobileIosRuCardPaymentFlag(),
    getAppSubscriptionPaywallFlag(),
    getAppSubscriptionGatingFlag(),
  ]);

  return (
    <PageLayout
      title="Фича флаги"
      subtitle="Управление включением функций в мобильном приложении и подписочной логике"
    >
      <MobileAppFeaturesCard
        actorRole={session.user.role}
        initialVkLoginOnIos={vkLoginOnIos}
        initialIosRuCardPaymentHintEnabled={iosRuCardPaymentHintEnabled}
        initialIosRuCardPaymentEnabled={iosRuCardPaymentEnabled}
        initialAppSubscriptionPaywallEnabled={appSubscriptionPaywallEnabled}
        initialAppSubscriptionGatingEnabled={appSubscriptionGatingEnabled}
      />
    </PageLayout>
  );
}
