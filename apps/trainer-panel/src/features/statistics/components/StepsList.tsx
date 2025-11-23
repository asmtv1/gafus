import { Analytics } from "@mui/icons-material";
import { getDetailedStepStatisticsAction } from "@shared/lib/actions/statistics";
import { useState } from "react";

import StepStatsModal from "./modals/StepStatsModal";

import type { StepStats } from "@gafus/statistics";

import { Box, Paper, Typography } from "@/utils/muiImports";

interface StepsListProps {
  steps: StepStats[];
}

export default function StepsList({ steps }: StepsListProps) {
  const [selectedStep, setSelectedStep] = useState<StepStats | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);

  const handleStepClick = async (step: StepStats) => {
    setIsLoading(true);
    try {
      const res = await getDetailedStepStatisticsAction(step.id);
      if (res.success) {
        setSelectedStep(res.data || step);
      } else {
        setSelectedStep(step);
      }
      setIsModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedStep(null);
  };

  if (steps.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Шаги не найдены
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Создайте свой первый шаг, чтобы увидеть статистику
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
        <Analytics color="primary" />
        <Typography variant="h4" component="h2">
          Шаги
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {steps.map((step) => (
          <Paper
            key={step.id}
            sx={{ p: 2, cursor: "pointer", minWidth: 280 }}
            onClick={() => handleStepClick(step)}
          >
            <Typography variant="h6">{step.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              Длительность: {step.durationSec} сек
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Дней: {step.usedInDaysCount} · Курсов: {step.usedInCoursesCount}
            </Typography>
          </Paper>
        ))}
      </Box>

      <StepStatsModal open={isModalOpen} onClose={handleCloseModal} step={selectedStep} />
    </Box>
  );
}
