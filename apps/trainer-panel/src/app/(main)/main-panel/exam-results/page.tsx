import { Suspense } from "react";
import { Box, Typography, CircularProgress, Alert } from "@/utils/muiImports";
import { getExamResults } from "@/features/exam-results/lib/getExamResults";
import { ExamResultsList } from "@/features/exam-results/components/ExamResultsList";

async function ExamResultsContent() {
  try {
    const examResults = await getExamResults();
    
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Результаты экзаменов
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Просмотр результатов экзаменов по вашим курсам
        </Typography>
        
        <ExamResultsList examResults={examResults} />
      </Box>
    );
  } catch (error) {
    return (
      <Alert severity="error">
        Ошибка при загрузке результатов экзаменов: {error instanceof Error ? error.message : 'Неизвестная ошибка'}
      </Alert>
    );
  }
}

export default function ExamResultsPage() {
  return (
    <Box sx={{ p: 3 }}>
      <Suspense fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
          <CircularProgress />
        </Box>
      }>
        <ExamResultsContent />
      </Suspense>
    </Box>
  );
}
