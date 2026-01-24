"use client";

import { deleteDays } from "@features/courses/lib/deleteDays";
import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";

import PageLayout from "@shared/components/PageLayout";
import EnhancedDaysTable from "./EnhancedDaysTable";

import type { ActionResult, TrainerDayTableRow as Day } from "@gafus/types";

// Day тип теперь импортируется из @gafus/types

interface DaysClientProps {
  days: Day[];
  isAdmin?: boolean;
}

export default function DaysClient({ days, isAdmin = false }: DaysClientProps) {
  const router = useRouter();
  const [_state, formAction] = useActionState<ActionResult, FormData>(deleteDays, {});

  const handleDelete = (ids: string[]) => {
    const fd = new FormData();
    ids.forEach((id) => fd.append("ids", id));
    startTransition(() => {
      void formAction(fd);
    });
  };

  const uiDays = days.map(
    (
      day: Day & { author?: { username: string; profile?: { fullName: string | null } | null } },
    ) => ({
      ...day,
      author: day.author
        ? {
            username: day.author.username,
            fullName: day.author.profile?.fullName ?? null,
          }
        : undefined,
    }),
  );

  return (
    <PageLayout title="Созданные дни" subtitle="Управление вашими днями тренировок">
      <EnhancedDaysTable
        days={uiDays}
        onEditDay={(id) => router.push(`/main-panel/days/${id}/edit`)}
        onDeleteDays={handleDelete}
        isAdmin={isAdmin}
      />
    </PageLayout>
  );
}
