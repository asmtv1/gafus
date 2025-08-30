import Link from "next/link";

import type { UserWithTrainings } from "@gafus/types";

interface PrivateProfileSectionProps {
  user: UserWithTrainings;
}

export default function PrivateProfileSection({ user }: PrivateProfileSectionProps) {
  
  return (
    <section style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
     

      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <Link href="/passwordReset">
          <button
            style={{
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              padding: "12px 24px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            🔐 Сменить пароль
          </button>
        </Link>
      </div>
    </section>
  );
}
