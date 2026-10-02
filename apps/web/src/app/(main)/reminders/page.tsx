import { TrainingReminders } from "@/features/profile";
export default function RemindersPage() {
  return (
    <section style={{ maxWidth: 600, margin: "24px auto", padding: "0 16px" }}>
      <h1>Напоминания о тренировках</h1>
      <TrainingReminders />
    </section>
  );
}
