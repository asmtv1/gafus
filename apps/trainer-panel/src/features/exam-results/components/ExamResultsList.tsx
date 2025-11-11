"use client";

import React, { useEffect, useState, useTransition } from "react";
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Chip, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  Tabs,
  Tab,
  Button,
  Divider,
  Alert,
  CircularProgress,
  TextField
} from "@/utils/muiImports";
import { ExpandMoreIcon, VideoFileIcon, QuizIcon, EditIcon, CheckCircleIcon, CancelIcon } from "@/utils/muiImports";
import type { ChecklistQuestion } from "@gafus/types";
import type { ExamResultWithDetails } from "../lib/getExamResults";
import { reviewExamResult } from "../lib/reviewExamResult";
import { useRouter } from "next/navigation";

interface ExamResultsListProps {
  examResults: ExamResultWithDetails[];
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`exam-tabpanel-${index}`}
      aria-labelledby={`exam-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export function ExamResultsList({ examResults }: ExamResultsListProps) {
  const [expandedResult, setExpandedResult] = useState<string | false>(false);
  const [tabValue, setTabValue] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const router = useRouter();

  const formatDateTime = (value?: Date | string | null) => {
    if (!value) return null;
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("ru-RU");
  };

  const getReviewMeta = (result: ExamResultWithDetails) => {
    const metaParts: string[] = [];
    const updatedAt = formatDateTime(result.reviewedAt);
    const trainerName =
      result.reviewedBy?.profile?.fullName || result.reviewedBy?.username || null;

    if (updatedAt) {
      metaParts.push(`Обновлено: ${updatedAt}`);
    }

    if (trainerName) {
      metaParts.push(`Тренер: ${trainerName}`);
    }

    return metaParts.join(" • ");
  };

  useEffect(() => {
    const initialComments = examResults.reduce<Record<string, string>>((acc, result) => {
      acc[result.userStep.id] = result.trainerComment ?? "";
      return acc;
    }, {});

    setReviewComments(initialComments);
    setActionErrors({});
  }, [examResults]);

  const handleAccordionChange = (resultId: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedResult(isExpanded ? resultId : false);
  };

  const handleTabChange = (resultId: string) => (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(prev => ({ ...prev, [resultId]: newValue }));
  };

  const handleCommentChange =
    (userStepId: string) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setReviewComments((prev) => ({
        ...prev,
        [userStepId]: value,
      }));
    };

  const handleReviewExam = (userStepId: string, action: "approve" | "reject") => {
    setProcessingId(userStepId);
    setActionErrors((prev) => ({
      ...prev,
      [userStepId]: null,
    }));

    const formData = new FormData();
    formData.append("userStepId", userStepId);
    formData.append("action", action);

    const comment = reviewComments[userStepId]?.trim();
    if (comment) {
      formData.append("trainerComment", comment);
    }

    startTransition(async () => {
      try {
        const result = await reviewExamResult({}, formData);
        if (result.success) {
          router.refresh();
        } else {
          setActionErrors((prev) => ({
            ...prev,
            [userStepId]: result.error || "Не удалось сохранить решение",
          }));
        }
      } catch (error) {
        setActionErrors((prev) => ({
          ...prev,
          [userStepId]: error instanceof Error ? error.message : "Ошибка при сохранении решения",
        }));
      } finally {
        setProcessingId(null);
      }
    });
  };

  const getExamTypeChips = (result: ExamResultWithDetails) => {
    const chips = [];
    const step = result.userStep.stepOnDay.step;
    
    if (step.hasTestQuestions && result.testScore !== null) {
      chips.push(
        <Chip 
          key="test" 
          icon={<QuizIcon />} 
          label={`Тест: ${result.testScore}/${result.testMaxScore}`} 
          color="primary" 
          size="small"
        />
      );
    }
    
    if (step.requiresVideoReport && result.videoReportUrl) {
      chips.push(
        <Chip 
          key="video" 
          icon={<VideoFileIcon />} 
          label="Видео отчёт" 
          color="secondary" 
          size="small"
        />
      );
    }
    
    if (step.requiresWrittenFeedback && result.writtenFeedback) {
      chips.push(
        <Chip 
          key="written" 
          icon={<EditIcon />} 
          label="Письменная работа" 
          color="success" 
          size="small"
        />
      );
    }
    
    return chips;
  };

  const getStatusChip = (result: ExamResultWithDetails) => {
    const status = result.userStep.status;
    const hasTrainerReview = Boolean(result.reviewedAt);
    const isRejected = hasTrainerReview && result.isPassed === false;
    
    if (status === "COMPLETED") {
      return <Chip label="Сдан" color="success" size="small" />;
    }
    
    if (status === "IN_PROGRESS") {
      if (isRejected) {
        return <Chip label="Не зачтён" color="error" size="small" />;
      }
      return <Chip label="Ожидает проверки" color="warning" size="small" />;
    }
    
    return <Chip label="Не начат" color="default" size="small" />;
  };

  if (examResults.length === 0) {
    return (
      <Alert severity="info">
        Пока нет результатов экзаменов для просмотра
      </Alert>
    );
  }

  return (
    <Box>
      {examResults.map((result) => {
        const currentTabValue = tabValue[result.id] || 0;
        const step = result.userStep.stepOnDay.step;
        const user = result.userStep.userTraining.user;
        const course = result.userStep.userTraining.dayOnCourse.course;
        const day = result.userStep.userTraining.dayOnCourse.day;
        
        return (
          <Accordion 
            key={result.id} 
            expanded={expandedResult === result.id} 
            onChange={handleAccordionChange(result.id)}
            sx={{ mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h6">
                    {user.profile?.fullName || user.username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {course.name} - {day.title} - {step.title}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {getExamTypeChips(result)}
                  {getStatusChip(result)}
                </Box>
              </Box>
            </AccordionSummary>
            
            <AccordionDetails>
              <Box sx={{ width: '100%' }}>
                <Tabs 
                  value={currentTabValue} 
                  onChange={handleTabChange(result.id)}
                  aria-label="exam results tabs"
                >
                  {step.hasTestQuestions && (
                    <Tab label="Тестовые вопросы" />
                  )}
                  {step.requiresVideoReport && (
                    <Tab label="Видео отчёт" />
                  )}
                  {step.requiresWrittenFeedback && (
                    <Tab label="Письменная работа" />
                  )}
                </Tabs>

                {step.hasTestQuestions && (
                  <TabPanel value={currentTabValue} index={0}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Результаты теста
                      </Typography>
                      <Typography variant="body1" gutterBottom>
                        Баллы: {result.testScore || 0} из {result.testMaxScore || 0}
                      </Typography>
                      
                      {(() => {
                        const rawTestAnswers = result.testAnswers;
                        const rawChecklist = step.checklist;

                        let testAnswers: Record<string, number> | null = null;
                        if (rawTestAnswers) {
                          if (typeof rawTestAnswers === "string") {
                            try {
                              const parsed = JSON.parse(rawTestAnswers);
                              if (parsed && typeof parsed === "object") {
                                testAnswers = parsed as Record<string, number>;
                              }
                            } catch (error) {
                              console.error("Не удалось распарсить testAnswers", error);
                            }
                          } else if (typeof rawTestAnswers === "object") {
                            testAnswers = rawTestAnswers as Record<string, number>;
                          }
                        }

                        let checklist: ChecklistQuestion[] | null = null;
                        if (rawChecklist) {
                          if (typeof rawChecklist === "string") {
                            try {
                              const parsed = JSON.parse(rawChecklist);
                              if (Array.isArray(parsed)) {
                                checklist = parsed as ChecklistQuestion[];
                              }
                            } catch (error) {
                              console.error("Не удалось распарсить checklist", error);
                            }
                          } else if (Array.isArray(rawChecklist)) {
                            checklist = rawChecklist as ChecklistQuestion[];
                          }
                        }

                        if (!testAnswers || !checklist) {
                          return (
                            <Alert severity="info" sx={{ mt: 2 }}>
                              Тестовые ответы недоступны. Возможно, ученик ещё не завершил тест или данные не были сохранены.
                            </Alert>
                          );
                        }

                        return (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="h6" gutterBottom>
                              Ответы пользователя:
                            </Typography>
                            {checklist.map((question: ChecklistQuestion, index: number) => {
                            const userAnswer = testAnswers?.[question.id];
                            const userAnswerIndex =
                              typeof userAnswer === "number" && userAnswer >= 0 && userAnswer < question.options.length
                                ? userAnswer
                                : null;
                            const userAnswerText =
                              userAnswerIndex !== null ? question.options[userAnswerIndex] : "Ответ не выбран";
                            const correctAnswerIndex =
                              typeof question.correctAnswer === "number" &&
                              question.correctAnswer >= 0 &&
                              question.correctAnswer < question.options.length
                                ? question.correctAnswer
                                : null;
                            const correctAnswerText =
                              correctAnswerIndex !== null
                                ? question.options[correctAnswerIndex]
                                : "Правильный ответ не указан";
                            const isCorrect = userAnswerIndex !== null && userAnswerIndex === correctAnswerIndex;
                            
                            return (
                              <Card key={question.id} sx={{ mb: 2, border: isCorrect ? '1px solid green' : '1px solid red' }}>
                                <CardContent>
                                  <Typography variant="subtitle1" gutterBottom>
                                    {index + 1}. {question.question}
                                  </Typography>

                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                                    {isCorrect ? (
                                      <CheckCircleIcon color="success" fontSize="small" />
                                    ) : (
                                      <CancelIcon color="error" fontSize="small" />
                                    )}
                                    <Typography
                                      variant="subtitle2"
                                      color={isCorrect ? "success.main" : "error.main"}
                                      sx={{ fontWeight: 600 }}
                                    >
                                      {isCorrect ? "Ответ совпадает" : "Ответ не совпадает"}
                                    </Typography>
                                  </Box>

                                  <Box sx={{ ml: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      Ответ пользователя:
                                    </Typography>
                                    <Typography variant="body2" color={userAnswerIndex !== null ? "text.primary" : "text.secondary"}>
                                      {userAnswerText}
                                    </Typography>

                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      Правильный ответ:
                                    </Typography>
                                    <Typography variant="body2" color="text.primary">
                                      {correctAnswerText}
                                    </Typography>

                                    <Divider sx={{ my: 2 }} />

                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                      Варианты ответа:
                                    </Typography>
                                    {question.options.map((option: string, optionIndex: number) => (
                                      <Typography
                                        key={optionIndex}
                                        variant="body2"
                                        sx={{
                                          color:
                                            optionIndex === userAnswerIndex
                                              ? isCorrect
                                                ? "success.main"
                                                : "error.main"
                                              : optionIndex === correctAnswerIndex
                                              ? "success.main"
                                              : "text.secondary",
                                          fontWeight:
                                            optionIndex === userAnswerIndex || optionIndex === correctAnswerIndex
                                              ? 600
                                              : 400,
                                        }}
                                      >
                                        {optionIndex === correctAnswerIndex ? "✓ " : "  "}
                                        {option}
                                        {optionIndex === userAnswerIndex && " (ответ пользователя)"}
                                      </Typography>
                                    ))}
                                  </Box>
                              {question.comment && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 2 }}
                                >
                                  Комментарий тренера: {question.comment}
                                </Typography>
                              )}
                                </CardContent>
                              </Card>
                            );
                            })}
                          </Box>
                        );
                      })()}
                    </Box>
                  </TabPanel>
                )}

                {step.requiresVideoReport && (
                  <TabPanel value={currentTabValue} index={step.hasTestQuestions ? 1 : 0}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Видео отчёт
                      </Typography>
                      {result.videoReportUrl ? (
                        <Box>
                          <video 
                            controls 
                            width="100%" 
                            style={{ maxWidth: '600px' }}
                            src={result.videoReportUrl}
                          >
                            Ваш браузер не поддерживает видео.
                          </video>
                          <Button 
                            variant="outlined" 
                            href={result.videoReportUrl} 
                            target="_blank"
                            sx={{ mt: 1 }}
                          >
                            Открыть в новом окне
                          </Button>
                        </Box>
                      ) : (
                        <Alert severity="warning">
                          Видео отчёт не загружен
                        </Alert>
                      )}
                    </Box>
                  </TabPanel>
                )}

                {step.requiresWrittenFeedback && (
                  <TabPanel value={currentTabValue} index={step.hasTestQuestions ? (step.requiresVideoReport ? 2 : 1) : (step.requiresVideoReport ? 1 : 0)}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Письменная обратная связь
                      </Typography>
                      {result.writtenFeedback ? (
                        <Card>
                          <CardContent>
                            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                              {result.writtenFeedback}
                            </Typography>
                          </CardContent>
                        </Card>
                      ) : (
                        <Alert severity="warning">
                          Письменная обратная связь не предоставлена
                        </Alert>
                      )}
                    </Box>
                  </TabPanel>
                )}

                <Divider sx={{ my: 2 }} />

                {result.trainerComment && (
                  <Alert
                    severity={
                      result.isPassed === true
                        ? "success"
                        : result.isPassed === false
                        ? "error"
                        : "info"
                    }
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="subtitle2" gutterBottom>
                      Комментарий тренера
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {result.trainerComment}
                    </Typography>
                    {getReviewMeta(result) && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 1 }}
                      >
                        {getReviewMeta(result)}
                      </Typography>
                    )}
                  </Alert>
                )}

                {result.userStep.status === "IN_PROGRESS" && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <TextField
                      label="Комментарий для ученика"
                      placeholder="Расскажите, что получилось хорошо или что нужно доработать"
                      multiline
                      minRows={2}
                      maxRows={6}
                      value={reviewComments[result.userStep.id] ?? ""}
                      onChange={handleCommentChange(result.userStep.id)}
                      fullWidth
                    />

                    {actionErrors[result.userStep.id] && (
                      <Alert severity="error">
                        {actionErrors[result.userStep.id]}
                      </Alert>
                    )}

                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Отправлено: {formatDateTime(result.createdAt)}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={
                            processingId === result.userStep.id ? (
                              <CircularProgress size={20} color="inherit" />
                            ) : undefined
                          }
                          onClick={() => handleReviewExam(result.userStep.id, "reject")}
                          disabled={processingId === result.userStep.id || isPending}
                        >
                          {processingId === result.userStep.id ? "Обработка..." : "Не зачёт"}
                        </Button>
                        <Button
                          variant="contained"
                          color="success"
                          startIcon={
                            processingId === result.userStep.id ? (
                              <CircularProgress size={20} color="inherit" />
                            ) : (
                              <CheckCircleIcon />
                            )
                          }
                          onClick={() => handleReviewExam(result.userStep.id, "approve")}
                          disabled={processingId === result.userStep.id || isPending}
                        >
                          {processingId === result.userStep.id ? "Обработка..." : "Зачесть"}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}

                {result.userStep.status === "COMPLETED" && (
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <Typography variant="body2" color="text.secondary">
                      Отправлено: {formatDateTime(result.createdAt)}
                    </Typography>
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="Зачтено"
                      color="success"
                      variant="outlined"
                    />
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
