"use client";

import { Button, SwipeableDrawer, Typography } from "@mui/material";
import Link from "next/link";
import { AppSubscriptionPaywall } from "@/features/app-subscription";

export interface PaidCourseDrawerCourse {
  id: string;
  name: string;
  type: string;
}

interface PaidCourseDrawerProps {
  open: boolean;
  onClose: () => void;
  course: PaidCourseDrawerCourse | null;
  userId: string | undefined;
}

/** Subscription-only course gate. Individual payments are no longer offered. */
export function PaidCourseDrawer({ open, onClose, course, userId }: PaidCourseDrawerProps) {
  if (!course) return null;
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{ sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, px: 2, pt: 2, pb: 3 } }}
    >
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{course.name}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Доступ ко всем курсам и статьям открывается по подписке.
      </Typography>
      {userId ? (
        <AppSubscriptionPaywall mode="embedded" />
      ) : (
        <Button
          component={Link}
          href={`/login?returnUrl=${encodeURIComponent(`/trainings/${course.type}`)}`}
          variant="contained"
          fullWidth
          onClick={onClose}
        >Войти и оформить подписку</Button>
      )}
      <Button variant="outlined" fullWidth sx={{ mt: 1 }} onClick={onClose}>Закрыть</Button>
    </SwipeableDrawer>
  );
}
