import {
  Star,
  Favorite,
  ThumbUp,
  ThumbDown,
  TrendingUp,
  SentimentSatisfied,
} from "@mui/icons-material";

import { Typography, Box, Paper, Chip, LinearProgress } from "@/utils/muiImports";

interface SocialAnalyticsProps {
  socialAnalytics: {
    ratingDistribution: Record<string, number>;
    reviewSentiment: { positive: number; neutral: number; negative: number };
    favoriteCount: number;
    recommendationEffectiveness: number;
  };
}

export default function SocialAnalytics({ socialAnalytics }: SocialAnalyticsProps) {
  const { ratingDistribution, reviewSentiment, favoriteCount, recommendationEffectiveness } =
    socialAnalytics;

  // Вычисляем общее количество отзывов
  const totalReviews = Object.values(ratingDistribution).reduce((sum, count) => sum + count, 0);
  const totalSentiment =
    reviewSentiment.positive + reviewSentiment.neutral + reviewSentiment.negative;

  // Находим средний рейтинг
  const averageRating =
    totalReviews > 0
      ? Object.entries(ratingDistribution).reduce(
          (sum, [rating, count]) => sum + parseInt(rating) * count,
          0,
        ) / totalReviews
      : 0;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Социальная аналитика
      </Typography>

      {/* Основные метрики */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <Star sx={{ color: "warning.main", mr: 1 }} />
              <Typography variant="h5" color="warning" fontWeight="bold">
                {averageRating.toFixed(1)}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Средний рейтинг
            </Typography>
            <Chip
              label={`${totalReviews} отзывов`}
              size="small"
              color="warning"
              variant="outlined"
            />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <Favorite sx={{ color: "error.main", mr: 1 }} />
              <Typography variant="h5" color="error" fontWeight="bold">
                {favoriteCount}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              В избранном
            </Typography>
            <Chip label="пользователей" size="small" color="error" variant="outlined" />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <ThumbUp sx={{ color: "success.main", mr: 1 }} />
              <Typography variant="h5" color="success" fontWeight="bold">
                {totalSentiment > 0
                  ? Math.round((reviewSentiment.positive / totalSentiment) * 100)
                  : 0}
                %
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Позитивных отзывов
            </Typography>
            <Chip
              label={`${reviewSentiment.positive} из ${totalSentiment}`}
              size="small"
              color="success"
              variant="outlined"
            />
          </Paper>
        </Box>

        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <TrendingUp sx={{ color: "info.main", mr: 1 }} />
              <Typography variant="h5" color="info" fontWeight="bold">
                {recommendationEffectiveness}%
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Эффективность рекомендаций
            </Typography>
            <Chip label="завершили курс" size="small" color="info" variant="outlined" />
          </Paper>
        </Box>
      </Box>

      {/* Распределение рейтингов */}
      <Typography variant="subtitle1" gutterBottom>
        Распределение рейтингов
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {Object.entries(ratingDistribution).map(([rating, count]) => (
            <Box key={rating} sx={{ flex: "1 1 200px", minWidth: 0 }}>
              <Box sx={{ textAlign: "center", p: 2 }}>
                <Box
                  sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}
                >
                  {Array.from({ length: parseInt(rating) }, (_, i) => (
                    <Star key={i} sx={{ color: "warning.main", fontSize: 16 }} />
                  ))}
                </Box>
                <Typography variant="h6" color="warning.main" fontWeight="bold">
                  {count}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {rating} звезд
                </Typography>
                {totalReviews > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {Math.round((count / totalReviews) * 100)}%
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Анализ тональности */}
      <Typography variant="subtitle1" gutterBottom>
        Анализ тональности отзывов
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
            <Box sx={{ textAlign: "center", p: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
                <ThumbUp sx={{ color: "success.main", mr: 1 }} />
                <Typography variant="h6" color="success.main" fontWeight="bold">
                  {reviewSentiment.positive}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Позитивные
              </Typography>
              {totalSentiment > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={(reviewSentiment.positive / totalSentiment) * 100}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "grey.200",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      backgroundColor: "success.main",
                    },
                  }}
                />
              )}
            </Box>
          </Box>

          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
            <Box sx={{ textAlign: "center", p: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
                <SentimentSatisfied sx={{ color: "warning.main", mr: 1 }} />
                <Typography variant="h6" color="warning.main" fontWeight="bold">
                  {reviewSentiment.neutral}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Нейтральные
              </Typography>
              {totalSentiment > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={(reviewSentiment.neutral / totalSentiment) * 100}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "grey.200",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      backgroundColor: "warning.main",
                    },
                  }}
                />
              )}
            </Box>
          </Box>

          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
            <Box sx={{ textAlign: "center", p: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
                <ThumbDown sx={{ color: "error.main", mr: 1 }} />
                <Typography variant="h6" color="error.main" fontWeight="bold">
                  {reviewSentiment.negative}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Негативные
              </Typography>
              {totalSentiment > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={(reviewSentiment.negative / totalSentiment) * 100}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "grey.200",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      backgroundColor: "error.main",
                    },
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
