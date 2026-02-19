import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import CacheManagement from "@/features/admin/components/CacheManagement";
import StorageManagement from "@/features/admin/components/StorageManagement";
import {
  getStorageStats,
  type StorageStats,
} from "@/features/admin/lib/getStorageStats";
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

        {/* Управление кэшем */}
        <CacheManagement />
      </div>
    </PageLayout>
  );
}
