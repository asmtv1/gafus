"use client";

import { useState } from "react";
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  IconButton, 
  TextField, 
  Typography,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio
} from "@/utils/muiImports";
import { AddIcon, DeleteIcon } from "@/utils/muiImports";

interface ChecklistQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // индекс правильного ответа
}

interface ChecklistEditorProps {
  checklist: ChecklistQuestion[];
  onChange: (checklist: ChecklistQuestion[]) => void;
}

export default function ChecklistEditor({ checklist, onChange }: ChecklistEditorProps) {
  const [questions, setQuestions] = useState<ChecklistQuestion[]>(checklist);

  const addQuestion = () => {
    const newQuestion: ChecklistQuestion = {
      id: `question_${Date.now()}`,
      question: "",
      options: ["", ""],
      correctAnswer: 0
    };
    const updatedQuestions = [...questions, newQuestion];
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  const removeQuestion = (questionId: string) => {
    const updatedQuestions = questions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  const updateQuestion = (questionId: string, field: keyof ChecklistQuestion, value: string | number) => {
    const updatedQuestions = questions.map(q => 
      q.id === questionId ? { ...q, [field]: value } : q
    );
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  const addOption = (questionId: string) => {
    const updatedQuestions = questions.map(q => 
      q.id === questionId 
        ? { ...q, options: [...q.options, ""] }
        : q
    );
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    const updatedQuestions = questions.map(q => {
      if (q.id === questionId) {
        const newOptions = q.options.filter((_, index) => index !== optionIndex);
        const newCorrectAnswer = q.correctAnswer >= optionIndex 
          ? Math.max(0, q.correctAnswer - 1) 
          : q.correctAnswer;
        return { ...q, options: newOptions, correctAnswer: newCorrectAnswer };
      }
      return q;
    });
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    const updatedQuestions = questions.map(q => 
      q.id === questionId 
        ? { ...q, options: q.options.map((opt, idx) => idx === optionIndex ? value : opt) }
        : q
    );
    setQuestions(updatedQuestions);
    onChange(updatedQuestions);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h3">
          Вопросы для экзамена
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={addQuestion}
          size="small"
        >
          Добавить вопрос
        </Button>
      </Box>

      {questions.length === 0 ? (
        <Card sx={{ p: 3, textAlign: 'center', backgroundColor: '#f5f5f5' }}>
          <Typography variant="body1" color="text.secondary">
            Пока нет вопросов. Нажмите "Добавить вопрос" чтобы создать первый вопрос.
          </Typography>
        </Card>
      ) : (
        questions.map((question, questionIndex) => (
          <Card key={question.id} sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  Вопрос {questionIndex + 1}
                </Typography>
                <IconButton
                  onClick={() => removeQuestion(question.id)}
                  color="error"
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>

              <TextField
                fullWidth
                label="Текст вопроса"
                value={question.question}
                onChange={(e) => updateQuestion(question.id, 'question', e.target.value)}
                placeholder="Введите текст вопроса..."
                multiline
                rows={2}
                sx={{ mb: 2 }}
              />

              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">Варианты ответов</FormLabel>
                <RadioGroup
                  value={question.correctAnswer}
                  onChange={(e) => updateQuestion(question.id, 'correctAnswer', parseInt(e.target.value))}
                >
                  {question.options.map((option, optionIndex) => (
                    <Box key={optionIndex} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <FormControlLabel
                        value={optionIndex}
                        control={<Radio />}
                        label=""
                        sx={{ mr: 1 }}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        value={option}
                        onChange={(e) => updateOption(question.id, optionIndex, e.target.value)}
                        placeholder={`Вариант ${optionIndex + 1}`}
                        sx={{ mr: 1 }}
                      />
                      {question.options.length > 2 && (
                        <IconButton
                          onClick={() => removeOption(question.id, optionIndex)}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </RadioGroup>
              </FormControl>

              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => addOption(question.id)}
                size="small"
                sx={{ mt: 1 }}
              >
                Добавить вариант
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
