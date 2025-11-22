"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";

import PageLayout from "@shared/components/PageLayout";
import EnhancedStepsTable from "./EnhancedStepsTable";

import type { ActionResult, TrainerStepTableRow } from "@gafus/types";

import { deleteSteps } from "@/features/steps/lib/deleteSteps";

interface StepsClientProps {
  steps: TrainerStepTableRow[];
  isAdmin?: boolean;
}

export default function StepsClient({ steps, isAdmin = false }: StepsClientProps) {
  const router = useRouter();
  const [_state, formAction] = useActionState<ActionResult, FormData>(deleteSteps, {});

  const handleDelete = (ids: string[]) => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", id));
    startTransition(() => {
      void formAction(fd);
    });
  };

  const uiSteps = (steps || []).map((s: TrainerStepTableRow & { author?: { username: string; profile?: { fullName: string | null } | null } }) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    durationSec: s.durationSec,
    estimatedDurationSec: s.estimatedDurationSec ?? null,
    author: s.author
      ? {
          username: s.author.username,
          fullName: s.author.profile?.fullName ?? null,
        }
      : undefined,
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
    <PageLayout 
      title="Созданные шаги" 
      subtitle="Управление вашими шагами тренировок"
    >
      <EnhancedStepsTable
        steps={uiSteps}
        onEditStep={(id) => router.push(`/main-panel/steps/${id}/edit`)}
        onDeleteSteps={handleDelete}
        isAdmin={isAdmin}
      />
    </PageLayout>
  );
}
