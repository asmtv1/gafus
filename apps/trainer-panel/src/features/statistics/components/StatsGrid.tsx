import { TrendingUp, School, CalendarToday } from "@mui/icons-material";

import { Card, CardContent, Typography, Box } from "@/utils/muiImports";

interface StatsGridProps {
  totalCourses: number;
  totalDays: number;
}

export default function StatsGrid({ totalCourses, totalDays }: StatsGridProps) {
  const stats = [
    {
      title: "Курсы",
      value: totalCourses,
      icon: <School sx={{ fontSize: 40, color: "primary.main" }} />,
      color: "primary.main",
    },
    {
      title: "Дней тренировок",
      value: totalDays,
      icon: <CalendarToday sx={{ fontSize: 40, color: "secondary.main" }} />,
      color: "secondary.main",
    },
    {
      title: "Активность",
      value: totalDays > 0 ? Math.round((totalDays / totalCourses) * 10) / 10 : 0,
      icon: <TrendingUp sx={{ fontSize: 40, color: "success.main" }} />,
      color: "success.main",
      suffix: " дней/курс",
    },
  ];

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mb: 4 }}>
      {stats.map((stat, index) => (
        <Box key={index} sx={{ flex: "1 1 300px", minWidth: 0 }}>
          <Card
            sx={{
              height: "100%",
              transition: "transform 0.2s ease-in-out",
              "&:hover": {
                transform: "translateY(-4px)",
                boxShadow: 4,
              },
            }}
          >
            <CardContent sx={{ textAlign: "center", p: 3 }}>
              <Box sx={{ mb: 2 }}>{stat.icon}</Box>
              <Typography
                variant="h3"
                component="div"
                sx={{
                  fontWeight: "bold",
                  color: stat.color,
                  mb: 1,
                }}
              >
                {stat.value}
                {stat.suffix || ""}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 1 }}
              >
                {stat.title}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      ))}
    </Box>
  );
}
