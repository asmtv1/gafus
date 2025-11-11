import { Suspense } from "react";
import { Box, Typography, CircularProgress } from "@/utils/muiImports";
import { FAQContent } from "@/features/faq/components/FAQContent";

export default function FAQPage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: "text.primary" }}>
        Частые вопросы
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Найдите ответы на часто задаваемые вопросы о работе с панелью тренера
      </Typography>

      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "200px",
            }}
          >
            <CircularProgress />
          </Box>
        }
      >
        <FAQContent />
      </Suspense>
    </Box>
  );
}

