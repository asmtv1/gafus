import CoursesPage from "./courses/page";
import OfflineCacheTester from "@shared/components/ui/OfflineCacheTester";

export default function HomePage() {
  return (
    <main>
      <CoursesPage />
      <OfflineCacheTester />
    </main>
  );
}
