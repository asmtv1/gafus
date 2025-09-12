"use client";

import { createTrainingDay } from "@features/steps/lib/createTrainingDay";
import { updateTrainingDay } from "@features/steps/lib/updateTrainingDay";
import { Box, Button } from "@mui/material";
import DualListSelector from "@shared/components/common/DualListSelector";
import { Toast, useToast } from "@shared/components/ui/Toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import TrainingDayForm from "./TrainingDayForm";
import sharedStyles from "@shared/styles/FormLayout.module.css";
import FormSection from "@shared/components/FormSection";

import type { IdTitleItem as Step } from "@gafus/types";

// Step тип теперь импортируется из @gafus/types

interface Props {
  allSteps: Step[];
  initialDay?: {
    id: string;
    title: string;
    type: string;
    description: string;
    equipment: string;
    stepIds: string[];
  };
}

export default function CreateDayClient({ allSteps, initialDay }: Props) {
  const isEdit = Boolean(initialDay?.id);
  const router = useRouter();
  const [selectedSteps, setSelectedSteps] = useState<Step[]>(
    initialDay
      ? initialDay.stepIds
          .map((sid) => allSteps.find((s) => s.id === sid))
          .filter((s): s is Step => Boolean(s))
      : [],
  );
  const [dayInfo, setDayInfo] = useState({
    title: initialDay?.title ?? "",
    type: initialDay?.type ?? "regular",
    description: initialDay?.description ?? "",
    equipment: initialDay?.equipment ?? "",
  });
  const { open, message, severity, showToast, closeToast } = useToast();

  const handleSaveDay = async () => {
    if (
      !dayInfo.title.trim() ||
      !dayInfo.description.trim() ||
      !dayInfo.type.trim() ||
      selectedSteps.length === 0
    ) {
      alert("Пожалуйста, заполните все поля и выберите шаги");
      return;
    }

    try {
      if (initialDay?.id) {
        await updateTrainingDay({
          id: initialDay.id,
          ...dayInfo,
          stepIds: selectedSteps.map((s) => s.id),
        });
        showToast("День успешно обновлён", "success");
        // Очистка формы и возврат к списку дней
        setDayInfo({ title: "", type: "regular", description: "", equipment: "" });
        setSelectedSteps([]);
        router.push("/main-panel/days");
      } else {
        await createTrainingDay({
          ...dayInfo,
          stepIds: selectedSteps.map((s) => s.id),
        });
        showToast("День успешно создан", "success");
        // Очистка формы после создания
        setDayInfo({ title: "", type: "regular", description: "", equipment: "" });
        setSelectedSteps([]);
      }
    } catch (err) {
      console.error("Ошибка при сохранении:", err);
      showToast("Ошибка при сохранении дня", "error");
    }
  };

  return (
    <Box className={sharedStyles.formContainer}>
      <FormSection title="Информация о дне тренировки">
        <TrainingDayForm
          title={dayInfo.title}
          type={dayInfo.type}
          description={dayInfo.description}
          equipment={dayInfo.equipment}
          onChange={setDayInfo}
        />
      </FormSection>

      <FormSection title="Выбор шагов">
        <DualListSelector<Step>
          allItems={allSteps}
          selectedItems={selectedSteps}
          onSelectionChange={setSelectedSteps}
          getItemLabel={(step) => step.title}
          getItemId={(step) => step.id}
          title="Шаги дня"
          allowDuplicates={true}
        />
      </FormSection>

      <Box className={sharedStyles.formActions}>
        <Button 
          variant="contained" 
          onClick={handleSaveDay} 
          className={sharedStyles.formButton}
        >
          {isEdit ? "Сохранить изменения" : "Создать день"}
        </Button>
      </Box>

      <Toast open={open} message={message} severity={severity} onClose={closeToast} />
    </Box>
  );
}
