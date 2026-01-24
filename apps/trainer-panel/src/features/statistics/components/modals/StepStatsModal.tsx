import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@/utils/muiImports";

interface StepStatsModalProps {
  open: boolean;
  onClose: () => void;
  step: {
    title: string;
    days?: { title: string }[];
    courses?: { name: string }[];
    completionRate?: number;
    timeAnalytics?: { averageTimeToCompleteSec?: number };
  } | null;
}

export default function StepStatsModal({ open, onClose, step }: StepStatsModalProps) {
  if (!step) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          },
        },
      }}
    >
      <DialogTitle>Статистика шага: {step.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Box>
            <Typography variant="subtitle2">Используется в днях</Typography>
            <Typography variant="body2">
              {Array.from(new Set((step.days || []).map((d: { title: string }) => d.title))).join(
                ", ",
              ) || "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Курсы</Typography>
            <Typography variant="body2">
              {Array.from(new Set((step.courses || []).map((c: { name: string }) => c.name))).join(
                ", ",
              ) || "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Завершение</Typography>
            <Typography variant="body2">{step.completionRate || 0}%</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2">Среднее время выполнения</Typography>
            <Typography variant="body2">
              {step.timeAnalytics?.averageTimeToCompleteSec || 0} сек
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
