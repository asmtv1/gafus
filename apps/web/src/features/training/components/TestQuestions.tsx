"use client";

import { useState } from "react";
import { Button, Card, CardContent, FormControl, FormControlLabel, Radio, RadioGroup, Typography, Alert, CircularProgress } from "@mui/material";
import { submitExamResult } from "@/shared/lib/actions/submitExamResult";

interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

interface TestQuestionsProps {
  checklist: ChecklistQuestion[];
  userStepId: string;
  stepId: string;
  onComplete: (answers: Record<string, number>) => void;
  onReset: () => void;
}

export function TestQuestions({ checklist, userStepId, stepId, onComplete, onReset }: TestQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAnswerChange = (questionId: string, answerIndex: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answerIndex
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const score = getScore();
      const overallScore = Math.round((score.correct / score.total) * 100);
      const isPassed = overallScore >= 70; // 70% для прохождения
      
      await submitExamResult({
        userStepId,
        stepId,
        testAnswers: answers,
        testScore: score.correct,
        testMaxScore: score.total,
        overallScore,
        isPassed
      });
      
      setIsSubmitted(true);
      setShowResults(true);
      onComplete(answers);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Ошибка при сохранении результатов");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setIsSubmitted(false);
    setShowResults(false);
    setSubmitError(null);
    onReset();
  };

  const getScore = () => {
    let correct = 0;
    checklist.forEach(question => {
      if (answers[question.id] === question.correctAnswer) {
        correct++;
      }
    });
    return { correct, total: checklist.length };
  };

  const score = getScore();

  return (
    <div style={{ padding: "16px" }}>
      <Typography variant="h6" gutterBottom>
        Тестовые вопросы
      </Typography>
      
      {checklist.map((question, index) => (
        <Card key={question.id} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Вопрос {index + 1}: {question.question}
            </Typography>
            
            <FormControl component="fieldset">
              <RadioGroup
                value={answers[question.id] ?? ""}
                onChange={(e) => handleAnswerChange(question.id, parseInt(e.target.value))}
              >
                {question.options.map((option, optionIndex) => (
                  <FormControlLabel
                    key={optionIndex}
                    value={optionIndex}
                    control={<Radio />}
                    label={option}
                    disabled={isSubmitted}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {showResults && (
              <Alert 
                severity={answers[question.id] === question.correctAnswer ? "success" : "error"}
                sx={{ mt: 1 }}
              >
                {answers[question.id] === question.correctAnswer 
                  ? "Правильно!" 
                  : `Неправильно. Правильный ответ: ${question.options[question.correctAnswer]}`
                }
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}

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
            disabled={Object.keys(answers).length !== checklist.length || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Сохранение...
              </>
            ) : (
              "Завершить тест"
            )}
          </Button>
        ) : (
          <>
            <Typography variant="h6">
              Результат: {score.correct} из {score.total} правильных ответов
            </Typography>
            <Button variant="outlined" onClick={handleReset}>
              Пройти заново
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
