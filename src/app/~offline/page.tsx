import { Suspense } from "react";
import OfflinePageClient from "./OfflinePageClient";

export const metadata = {
  title: "Оффлайн",
  description:
    "Вы потеряли соединение с интернетом. Попробуйте обновить страницу.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <Suspense fallback={<p>Загрузка…</p>}>
      <OfflinePageClient />
    </Suspense>
  );
}
