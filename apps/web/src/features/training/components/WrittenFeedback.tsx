"use client";

import { useState, useEffect } from "react";
import { Button, Card, CardContent, TextField, Typography, Alert, CircularProgress } from "@mui/material";
import { submitExamResult } from "@/shared/lib/actions/submitExamResult";
import { getExamResult } from "@/shared/lib/actions/getExamResult";

interface WrittenFeedbackProps {
  userStepId: string;
  stepId: string;
  onComplete: (feedback: string) => void;
  onReset: () => void;
}

export function WrittenFeedback({ userStepId, stepId, onComplete, onReset }: WrittenFeedbackProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Загружаем существующую обратную связь при монтировании компонента
  useEffect(() => {
    async function loadExistingData() {
      try {
        const examResult = await getExamResult(userStepId);
        if (examResult?.writtenFeedback) {
          setFeedback(examResult.writtenFeedback);
          setIsSubmitted(true);
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных экзамена:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadExistingData();
  }, [userStepId]);

  const handleSubmit = async () => {
    if (feedback.trim().length < 10) {
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      await submitExamResult({
        userStepId,
        stepId,
        writtenFeedback: feedback.trim(),
        overallScore: 100, // Письменная работа считается выполненной
        isPassed: true
      });
      
      setIsSubmitted(true);
      onComplete(feedback);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Ошибка при сохранении обратной связи");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFeedback("");
    setIsSubmitted(false);
    setSubmitError(null);
    onReset();
  };

  // Показываем индикатор загрузки
  if (isLoading) {
    return (
      <div style={{ padding: "16px", textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Загрузка данных...
        </Typography>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <Typography variant="h6" gutterBottom>
        Письменная обратная связь
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Пожалуйста, напишите ваши мысли о пройденном материале, что вы поняли, 
        какие у вас есть вопросы или комментарии.
      </Typography>

      {isSubmitted && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Ваша обратная связь сохранена. Ожидайте проверки тренером.
        </Alert>
      )}

      <Card>
        <CardContent>
          <TextField
            fullWidth
            multiline
            rows={6}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Введите вашу обратную связь..."
            disabled={isSubmitted}
            variant="outlined"
          />
          
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Минимум 10 символов
          </Typography>
        </CardContent>
      </Card>

      {submitError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {submitError}
        </Alert>
      )}
      
      <div style={{ display: "flex", gap: "16px", marginTop: "16px" }}>
        {!isSubmitted ? (
          <Button 
            variant="contained" 
            onClick={handleSubmit}
            disabled={feedback.trim().length < 10 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Сохранение...
              </>
            ) : (
              "Отправить обратную связь"
            )}
          </Button>
        ) : (
          <>
            <Alert severity="success" sx={{ flex: 1 }}>
              Обратная связь успешно отправлена!
            </Alert>
            <Button variant="outlined" onClick={handleReset}>
              Написать заново
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
