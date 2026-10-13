import { TrainingReminders } from "@/features/profile";
import styles from "./reminders.module.css";

export default function RemindersPage() {
  return (
    <section className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Напоминания о тренировках</h1>
        <TrainingReminders />
      </div>
    </section>
  );
}
