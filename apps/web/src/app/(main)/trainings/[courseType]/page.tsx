"use client";

import { useEffect, useState } from "react";
import TrainingPageClient from "@features/training/components/TrainingPageClient";

import styles from "./trainings.module.css";

interface TrainingsPageProps {
  params: Promise<{ courseType: string }>;
}

export default function TrainingsPage({ params }: TrainingsPageProps) {
  const [courseType, setCourseType] = useState<string>("");
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Получаем courseType из params
    params.then(({ courseType: type }) => setCourseType(type));
    
    // Проверяем онлайн статус
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Проверяем текущий статус
    setIsOnline(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [params]);

  // В офлайн режиме показываем только клиентский компонент
  if (!isOnline) {
    return (
      <main className={styles.container}>
        <h2 className={styles.title}>Содержание</h2>
        <div style={{ padding: '10px', background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', marginBottom: '20px' }}>
          📱 Офлайн режим - данные загружены из кэша
        </div>
        <TrainingPageClient 
          courseType={courseType}
          courseDescription={null}
          courseVideoUrl={null}
        />
      </main>
    );
  }

  // В онлайн режиме загружаем данные с сервера
  return (
    <main className={styles.container}>
      <h2 className={styles.title}>Содержание</h2>
      <TrainingPageClient 
        courseType={courseType}
        courseDescription={null}
        courseVideoUrl={null}
      />
    </main>
  );
}
