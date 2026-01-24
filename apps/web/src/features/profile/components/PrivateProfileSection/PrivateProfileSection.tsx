import type { UserWithTrainings } from "@gafus/types";

import TrainingReminders from "../TrainingReminders";
import styles from "./PrivateProfileSection.module.css";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
}

export default function PrivateProfileSection({ user: _user }: PrivateProfileSectionProps) {
  return (
    <section className={styles.section}>
      <div style={{ marginBottom: "20px" }}>
        <TrainingReminders />
      </div>
    </section>
  );
}
