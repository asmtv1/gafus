import { TrainingReminders } from "@/features/profile";
export default function RemindersPage() {
  return (
    <section style={{ width: "100%", maxWidth: 1440, margin: "24px auto", padding: "0 clamp(16px, 3vw, 56px)" }}>
      <h1>Напоминания о тренировках</h1>
      <TrainingReminders />
    </section>
  );
}
