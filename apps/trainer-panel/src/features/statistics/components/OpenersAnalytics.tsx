import { ExpandMore as ExpandMoreIcon, PeopleAlt } from "@mui/icons-material";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Chip,
  Paper,
  Typography,
} from "@/utils/muiImports";

interface OpenersAnalyticsProps {
  openersAnalytics: {
    totalOpeners: number;
    openers: {
      userId: string;
      username: string;
      avatarUrl: string | null;
      openedDays: { dayOrder: number; dayTitle: string; openedAt: Date }[];
    }[];
  };
  onUsernameClick: (username: string) => void;
}

export default function OpenersAnalytics({
  openersAnalytics,
  onUsernameClick,
}: OpenersAnalyticsProps) {
  const { totalOpeners, openers } = openersAnalytics;

  return (
    <Box>
      <Typography variant="h6" gutterBottom color="text.primary">
        Открывшие
      </Typography>

      {/* Метрика */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <Box sx={{ flex: "1 1 250px", minWidth: 0 }}>
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", mb: 1 }}>
              <PeopleAlt sx={{ color: "primary.main", mr: 1 }} />
              <Typography variant="h5" color="text.primary" fontWeight="bold">
                {totalOpeners}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Открыли хотя бы один день
            </Typography>
          </Paper>
        </Box>
      </Box>

      {/* Список пользователей */}
      {openers.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Пока нет пользователей, открывших дни курса
          </Typography>
        </Paper>
      ) : (
        openers.map((opener) => (
          <Accordion key={opener.userId} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1, sm: 2 },
                  width: "100%",
                  pr: { xs: 1, sm: 2 },
                  minWidth: 0,
                }}
              >
                <Avatar
                  sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 }, flexShrink: 0 }}
                  src={opener.avatarUrl ?? "/uploads/avatar.svg"}
                  alt={opener.username}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/uploads/avatar.svg";
                  }}
                />
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  sx={{
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: { xs: "0.875rem", sm: "1rem" },
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                  color="text.primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUsernameClick(opener.username);
                  }}
                >
                  {opener.username}
                </Typography>
                <Chip
                  label={`${opener.openedDays.length} дн.`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ flexShrink: 0 }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                {opener.openedDays.map((day) => (
                  <Typography
                    key={day.dayOrder}
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 0.5, fontSize: { xs: "0.75rem", sm: "0.875rem" } }}
                  >
                    День {day.dayOrder}: {day.dayTitle} —{" "}
                    {new Date(day.openedAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Typography>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  );
}
