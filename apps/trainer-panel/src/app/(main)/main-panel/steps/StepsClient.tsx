"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";

import EnhancedStepsTable from "./EnhancedStepsTable";

import type { ActionResult, TrainerStepTableRow } from "@gafus/types";

import { deleteSteps } from "@/features/steps/lib/deleteSteps";

interface StepsClientProps {
  steps: TrainerStepTableRow[];
}

export default function StepsClient({ steps }: StepsClientProps) {
  const router = useRouter();
  const [_state, formAction] = useActionState<ActionResult, FormData>(deleteSteps, {});

  const handleDelete = (ids: string[]) => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", id));
    startTransition(() => {
      void formAction(fd);
    });
  };

  const uiSteps = (steps || []).map((s: TrainerStepTableRow) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    durationSec: s.durationSec,
    stepLinks: (s.stepLinks || []).map((sl) => ({
      order: sl.order,
      day: {
        id: sl.day.id,
        title: sl.day.title,
        dayLinks: (sl.day?.dayLinks || []).map((dl) => ({
          course: { id: dl.course.id, name: dl.course.name },
        })),
      },
    })),
  }));

  return (
    <EnhancedStepsTable
      steps={uiSteps}
      onEditStep={(id) => router.push(`/main-panel/steps/${id}/edit`)}
      onDeleteSteps={handleDelete}
    />
  );
}
