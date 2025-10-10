import { Suspense } from "react";
import { Box, Typography, CircularProgress, Alert } from "@/utils/muiImports";
import { getExamResults } from "@/features/exam-results/lib/getExamResults";
import { ExamResultsListWithFilter } from "@/features/exam-results/components/ExamResultsListWithFilter";

async function ExamResultsContent({ hideCompleted }: { hideCompleted: boolean }) {
  try {
    // Всегда загружаем ВСЕ результаты, фильтрация на клиенте
    const examResults = await getExamResults({ hideCompleted: false });
    
    return (
      <Box>
        <Typography variant="h4" gutterBottom sx={{ color: 'text.primary' }}>
          Результаты экзаменов
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Просмотр результатов экзаменов по вашим курсам
        </Typography>
        
        <ExamResultsListWithFilter 
          initialExamResults={examResults} 
          initialHideCompleted={hideCompleted}
        />
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

export default async function ExamResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ hideCompleted?: string }>;
}) {
  const params = await searchParams;
  // По умолчанию фильтр включён (hideCompleted = true)
  const hideCompleted = params.hideCompleted !== undefined 
    ? params.hideCompleted === 'true' 
    : true;

  return (
    <Box sx={{ p: 3 }}>
      <Suspense fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
          <CircularProgress />
        </Box>
      }>
        <ExamResultsContent hideCompleted={hideCompleted} />
      </Suspense>
    </Box>
  );
}
