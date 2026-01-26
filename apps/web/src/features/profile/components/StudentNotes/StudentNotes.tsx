"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { getStudentNotes } from "@shared/server-actions";
import type { StudentNote } from "@shared/lib/notes/types";
import styles from "./StudentNotes.module.css";

export default function StudentNotes() {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNotes() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getStudentNotes();
        setNotes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка при загрузке заметок");
      } finally {
        setIsLoading(false);
      }
    }

    loadNotes();
  }, []);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Заметки тренера</h2>
        <p className={styles.loading}>Загрузка заметок...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Заметки тренера</h2>
        <p className={styles.error}>Ошибка: {error}</p>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Заметки тренера</h2>
        <p className={styles.empty}>Пока нет заметок от тренера</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Заметки тренера</h2>
      <div className={styles.notesList}>
        {notes.map((note) => (
          <div key={note.id} className={styles.noteCard}>
            {note.title && <h3 className={styles.noteTitle}>{note.title}</h3>}
            
            <div className={styles.noteMeta}>
              <span className={styles.trainerInfo}>
                Тренер: {note.trainer.profile?.fullName || note.trainer.username}
              </span>
              <span className={styles.noteDate}>
                {format(new Date(note.createdAt), "d MMMM yyyy", { locale: ru })}
              </span>
            </div>

            <div className={styles.entries}>
              {note.entries.map((entry) => (
                <div key={entry.id} className={styles.entry}>
                  <div className={styles.entryContent}>{entry.content}</div>
                  <div className={styles.entryMeta}>
                    <span className={styles.entryDate}>
                      {format(new Date(entry.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
                      {new Date(entry.updatedAt).getTime() !== new Date(entry.createdAt).getTime() && (
                        <> • Изменено: {format(new Date(entry.updatedAt), "d MMMM yyyy, HH:mm", { locale: ru })}</>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
