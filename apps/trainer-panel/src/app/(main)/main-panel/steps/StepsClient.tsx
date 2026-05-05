"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useActionState } from "react";

import PageLayout from "@shared/components/PageLayout";
import EnhancedStepsTable from "./EnhancedStepsTable";

import type { ActionResult, TrainerStepTableRow } from "@gafus/types";

import { deleteSteps } from "@/features/steps/lib/deleteSteps";

interface StepsClientProps {
  steps: TrainerStepTableRow[];
  isAdmin?: boolean;
  title?: string;
  subtitle?: string;
  pagePath?: string;
  enableCreateDayFromSteps?: boolean;
  searchParams?: {
    search?: string;
    orderBy?: string;
    order?: string;
    page?: string;
    rowsPerPage?: string;
    onlyOrphanSteps?: string;
  };
}

export default function StepsClient({
  steps,
  isAdmin = false,
  title = "Созданные шаги",
  subtitle = "Управление вашими шагами тренировок",
  pagePath = "/main-panel/steps",
  enableCreateDayFromSteps = true,
  searchParams: initialSearchParams,
}: StepsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [_state, formAction] = useActionState<ActionResult, FormData>(deleteSteps, {});

  const handleDelete = (ids: string[]) => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", id));
    startTransition(() => {
      void formAction(fd);
    });
  };

  const handleEditStep = (id: string) => {
    const currentParams = new URLSearchParams(searchParams.toString());
    const returnUrl = currentParams.toString() ? `${pagePath}?${currentParams.toString()}` : pagePath;
    router.push(`/main-panel/steps/${id}/edit?returnTo=${encodeURIComponent(returnUrl)}`);
  };

  const handleCreateDayFromSteps = (stepIds: string[]) => {
    const params = new URLSearchParams();
    stepIds.forEach((id) => params.append("stepIds", id));
    router.push(`/main-panel/days/new?${params.toString()}`);
  };

  const uiSteps = (steps || []).map(
    (
      s: TrainerStepTableRow & {
        author?: { username: string; profile?: { fullName: string | null } | null };
        createdAt?: Date;
      },
    ) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      durationSec: s.durationSec,
      estimatedDurationSec: s.estimatedDurationSec ?? null,
      createdAt: s.createdAt,
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
    }),
  );

  return (
    <PageLayout title={title} subtitle={subtitle}>
      <EnhancedStepsTable
        steps={uiSteps}
        onEditStep={handleEditStep}
        onDeleteSteps={handleDelete}
        onCreateDayFromSteps={enableCreateDayFromSteps ? handleCreateDayFromSteps : undefined}
        isAdmin={isAdmin}
        initialSearchParams={initialSearchParams}
      />
    </PageLayout>
  );
}
