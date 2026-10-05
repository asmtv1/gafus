"use client";
import { Alert, Button, Stack } from "@mui/material";

export default function ProfitError({ reset }: { reset: () => void }) {
  return (
    <Stack spacing={2}>
      <Alert severity="error">Не удалось загрузить финансовые данные.</Alert>
      <Button variant="outlined" onClick={reset}>
        Попробовать ещё раз
      </Button>
    </Stack>
  );
}
