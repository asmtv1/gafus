import Link from "next/link";

import type { UserWithTrainings } from "@gafus/types";

import ReengagementSettings from "./ReengagementSettings";
import styles from "./PrivateProfileSection.module.css";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
}

export default function PrivateProfileSection({ user }: PrivateProfileSectionProps) {
  
  return (
    <section className={styles.section}>
      <div style={{ marginBottom: "20px" }}>
        <ReengagementSettings />
      </div>
      
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <Link href="/passwordReset" className={styles.passwordButton}>
          🔐 Сменить пароль
        </Link>
      </div>
    </section>
  );
}
