import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import CacheManagement from "@features/admin/components/CacheManagement";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  // Проверяем права администратора
  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Администрирование</h1>
        <p className="text-gray-600 mt-2">
          Управление системой и кэшированием данных
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CacheManagement />
        
        {/* Можно добавить другие административные компоненты */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Статистика системы</h3>
          <p className="text-gray-600">
            Здесь будет отображаться статистика системы, метрики производительности и другая информация.
          </p>
        </div>
      </div>
    </div>
  );
}
