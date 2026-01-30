import type { Metadata } from "next";

import { generateStaticPageMetadata } from "@gafus/metadata";

import styles from "./contacts.module.css";

export const metadata: Metadata = generateStaticPageMetadata(
  "Контакты и реквизиты",
  "Контактная информация и реквизиты для связи.",
  "/contacts",
);

function getContactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "—";
}

function getContactPhone(): string {
  return process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || "—";
}

function getContactFio(): string {
  return process.env.NEXT_PUBLIC_CONTACT_FIO?.trim() || "—";
}

function getContactInn(): string {
  return process.env.NEXT_PUBLIC_CONTACT_INN?.trim() || "—";
}

export default function ContactsPage() {
  const email = getContactEmail();
  const phone = getContactPhone();
  const fio = getContactFio();
  const inn = getContactInn();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Контакты и реквизиты</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Связь</h2>
        <div className={styles.row}>
          <span className={styles.label}>Email:</span>
          {email === "—" ? (
            <span className={styles.value}>{email}</span>
          ) : (
            <a href={`mailto:${email}`} className={`${styles.value} ${styles.link}`}>
              {email}
            </a>
          )}
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Телефон:</span>
          {phone === "—" ? (
            <span className={styles.value}>{phone}</span>
          ) : (
            <a href={`tel:${phone.replace(/\s/g, "")}`} className={`${styles.value} ${styles.link}`}>
              {phone}
            </a>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Реквизиты</h2>
        <div className={styles.row}>
          <span className={styles.label}>ФИО:</span>
          <span className={styles.value}>{fio}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>ИНН:</span>
          <span className={styles.value}>{inn}</span>
        </div>
      </section>
    </div>
  );
}
