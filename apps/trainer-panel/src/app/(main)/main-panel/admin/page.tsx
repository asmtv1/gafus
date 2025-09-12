import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";

import CacheManagement from "@features/admin/components/CacheManagement";
import PageLayout from "@shared/components/PageLayout";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  
  // Проверяем права администратора
  if (!session?.user?.role || !["ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  return (
    <PageLayout 
      title="Администрирование" 
      subtitle="Управление системой и кэшированием данных"
    >
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '1.5rem' 
      }}>
        <CacheManagement />
        
        {/* Можно добавить другие административные компоненты */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          padding: '1.5rem'
        }}>
          <h3 style={{ 
            fontSize: '1.125rem', 
            fontWeight: '600', 
            marginBottom: '1rem',
            color: '#2c3e50'
          }}>
            Статистика системы
          </h3>
          <p style={{ color: '#6c757d' }}>
            Здесь будет отображаться статистика системы, метрики производительности и другая информация.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
