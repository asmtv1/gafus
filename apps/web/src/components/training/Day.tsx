"use client";

import { useEffect, useState } from "react";
import styles from "./day.module.css";
import { TrainingOverview } from "./TrainingOverview";
import { TrainingStepList } from "./TrainingStepList";
import { assignCoursesToUser } from "@/lib/user/userCourses";
import type { TrainingDetail } from "@gafus/types";

const nowSec = () => Math.floor(Date.now() / 1000);
const makeEndKey = (day: number, idx: number) => `training-${day}-${idx}-end`;
const makeLeftKey = (day: number, idx: number) => `training-${day}-${idx}-left`;

export default function Day({ training }: { training: TrainingDetail }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [runningIndex, setRunningIndex] = useState<number | null>(null);
  const [courseAssigned, setCourseAssigned] = useState(false);
  const [assignError, setAssignError] = useState<Error | null>(null);

  async function handleStepStart(stepIndex: number) {
    setRunningIndex(stepIndex);
  }

  function handleReset(index: number) {
    if (runningIndex === index) {
      setRunningIndex(null);
    }
  }

  async function handleFirstStart() {
    if (courseAssigned) return;
    try {
      const result = await assignCoursesToUser(training.courseId);
      if (result.success) {
        setCourseAssigned(true);
      }
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error("Unknown error");
      setAssignError(errorObj);
    }
  }

  // ─── Восстановление состояния runningIndex ────────────────────────────────
  useEffect(() => {
    const now = nowSec();
    for (let i = 0; i < training.steps.length; i++) {
      const end = localStorage.getItem(makeEndKey(training.day, i));
      const left = localStorage.getItem(makeLeftKey(training.day, i));
      if (
        (end && Number(end) > now) || // активный шаг
        left // на паузе
      ) {
        setRunningIndex(i);
        break;
      }
    }
  }, [training]);

  return (
    <main className={styles.main}>
      <header>
        <h1>{training.title}</h1>
      </header>

      {assignError && (
        <div className={styles.errorBox}>
          <p>Не удалось назначить курс. Пожалуйста, перезагрузите страницу.</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.retryButton}
          >
            Перезагрузить
          </button>
        </div>
      )}

      <TrainingOverview
        description={training.description}
        duration={training.duration}
        title={""}
      />

      <TrainingStepList
        steps={training.steps}
        openIndex={openIndex}
        setOpenIndex={setOpenIndex}
        runningIndex={runningIndex}
        onRun={handleStepStart}
        onReset={handleReset}
        handleFirstStart={handleFirstStart}
        courseType={training.type}
        day={training.day}
        styles={styles}
      />
    </main>
  );
}
