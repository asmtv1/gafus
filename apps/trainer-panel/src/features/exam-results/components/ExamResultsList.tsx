"use client";

import React, { useState } from "react";
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
  Alert
} from "@/utils/muiImports";
import { ExpandMoreIcon, VideoFileIcon, QuizIcon, EditIcon } from "@/utils/muiImports";
import type { ExamResultWithDetails } from "../lib/getExamResults";

interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

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

  const handleAccordionChange = (resultId: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedResult(isExpanded ? resultId : false);
  };

  const handleTabChange = (resultId: string) => (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(prev => ({ ...prev, [resultId]: newValue }));
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
    if (result.isPassed === null) {
      return <Chip label="В процессе" color="warning" size="small" />;
    }
    return result.isPassed ? 
      <Chip label="Сдан" color="success" size="small" /> : 
      <Chip label="Не сдан" color="error" size="small" />;
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
                        const hasTestAnswers = result.testAnswers != null && typeof result.testAnswers === 'object';
                        const hasChecklist = step.checklist && Array.isArray(step.checklist);
                        
                        if (!hasTestAnswers || !hasChecklist) return null;
                        
                        const testAnswers = result.testAnswers as Record<string, number>;
                        const checklist = step.checklist as ChecklistQuestion[];
                        
                        return (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="h6" gutterBottom>
                              Ответы пользователя:
                            </Typography>
                            {checklist.map((question: ChecklistQuestion, index: number) => {
                            const userAnswer = testAnswers?.[question.id];
                            const isCorrect = userAnswer === question.correctAnswer;
                            
                            return (
                              <Card key={question.id} sx={{ mb: 2, border: isCorrect ? '1px solid green' : '1px solid red' }}>
                                <CardContent>
                                  <Typography variant="subtitle1" gutterBottom>
                                    {index + 1}. {question.question}
                                  </Typography>
                                  <Box sx={{ ml: 2 }}>
                                    {question.options.map((option: string, optionIndex: number) => (
                                      <Typography 
                                        key={optionIndex}
                                        variant="body2"
                                        sx={{ 
                                          color: optionIndex === userAnswer ? 'primary.main' : 'text.secondary',
                                          fontWeight: optionIndex === userAnswer ? 'bold' : 'normal'
                                        }}
                                      >
                                        {optionIndex === question.correctAnswer ? '✓ ' : '  '}
                                        {option}
                                        {optionIndex === userAnswer && ' (ответ пользователя)'}
                                      </Typography>
                                    ))}
                                  </Box>
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
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Отправлено: {new Date(result.createdAt).toLocaleString('ru-RU')}
                  </Typography>
                  {result.overallScore !== null && (
                    <Typography variant="h6" color="primary">
                      Общая оценка: {result.overallScore}%
                    </Typography>
                  )}
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
