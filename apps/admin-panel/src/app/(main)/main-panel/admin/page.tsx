import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import CacheManagement from "@/features/admin/components/CacheManagement";
import { MobileAppFeaturesCard } from "@/features/admin/components/MobileAppFeaturesCard";
import { AppSubscriptionSettingsCard } from "@/features/admin/components/AppSubscriptionSettingsCard";
import StorageManagement from "@/features/admin/components/StorageManagement";
import {
  getAppSubscriptionGatingFlag,
  getAppSubscriptionPaywallFlag,
  getMobileIosRuCardPaymentFlag,
  getMobileIosRuCardPaymentHintFlag,
  getMobileVkLoginIosFlag,
} from "@/features/admin/lib/getMobileVkLoginIosFlag";
import {
  getStorageStats,
  type StorageStats,
} from "@/features/admin/lib/getStorageStats";
import { getAppSubscriptionSettingsAction } from "@/shared/lib/actions/appSubscriptionAdminActions";
import PageLayout from "@/shared/components/PageLayout";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  // Проверяем права администратора
  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  // Загружаем статистику хранилища (только для ADMIN)
  let storageStats: StorageStats | undefined = undefined;
  if (session.user.role === "ADMIN") {
    const result = await getStorageStats();
    if (result.success && result.data) {
      storageStats = result.data;
    }
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
  const appSubscriptionSettings = await getAppSubscriptionSettingsAction();

  return (
    <PageLayout title="Администрирование" subtitle="Управление системой и кэшированием данных">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Управление хранилищем (только для ADMIN) */}
        {storageStats && <StorageManagement stats={storageStats} />}

        <MobileAppFeaturesCard
          actorRole={session.user.role}
          initialVkLoginOnIos={vkLoginOnIos}
          initialIosRuCardPaymentHintEnabled={iosRuCardPaymentHintEnabled}
          initialIosRuCardPaymentEnabled={iosRuCardPaymentEnabled}
          initialAppSubscriptionPaywallEnabled={appSubscriptionPaywallEnabled}
          initialAppSubscriptionGatingEnabled={appSubscriptionGatingEnabled}
        />
        <AppSubscriptionSettingsCard
          actorRole={session.user.role}
          initialYookassaWeeklyPriceRub={appSubscriptionSettings.yookassaWeeklyPriceRub}
          initialAppleProductId={appSubscriptionSettings.appleProductId}
        />

        {/* Управление кэшем */}
        <CacheManagement />
      </div>
    </PageLayout>
  );
}
