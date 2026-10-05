import { Skeleton, Stack } from "@mui/material";
import PageLayout from "@/shared/components/PageLayout";

export default function ProfitLoading() {
  return (
    <PageLayout title="Чистая прибыль">
      <Stack spacing={2} aria-label="Загрузка расчёта">
        <Skeleton variant="rounded" height={80} />
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={240} />
      </Stack>
    </PageLayout>
  );
}
