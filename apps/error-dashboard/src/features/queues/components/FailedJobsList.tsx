import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Collapse,
  Divider,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  ExpandMore as ExpandIcon,
  Refresh as RetryIcon,
  Delete as DeleteIcon,
  ArrowUpward as PromoteIcon,
  Error as ErrorIcon,
  Schedule as TimeIcon,
  Code as CodeIcon,
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useRetryJob } from "@shared/hooks/useQueueJobs";

interface FailedJob {
  id: string;
  name: string;
  queueName: string;
  data: unknown;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

interface FailedJobsListProps {
  jobs: FailedJob[];
  queueName?: string;
}

export function FailedJobsList({ jobs, queueName }: FailedJobsListProps) {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const retryJob = useRetryJob();

  const toggleExpand = (jobId: string) => {
    setExpandedJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleRetry = async (job: FailedJob) => {
    try {
      await retryJob.mutateAsync({
        queueName: job.queueName,
        jobId: job.id,
        action: "retry",
      });
    } catch (error) {
      console.error("Error retrying job:", error);
    }
  };

  const handleRemove = async (job: FailedJob) => {
    try {
      await retryJob.mutateAsync({
        queueName: job.queueName,
        jobId: job.id,
        action: "remove",
      });
    } catch (error) {
      console.error("Error removing job:", error);
    }
  };

  const handlePromote = async (job: FailedJob) => {
    try {
      await retryJob.mutateAsync({
        queueName: job.queueName,
        jobId: job.id,
        action: "promote",
      });
    } catch (error) {
      console.error("Error promoting job:", error);
    }
  };

  if (jobs.length === 0) {
    return (
      <Alert severity="success" sx={{ borderRadius: 2 }}>
        {queueName ? `Нет проблемных задач в очереди ${queueName}` : "Нет проблемных задач"}
      </Alert>
    );
  }

  return (
    <Card elevation={1}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight="bold" mb={2}>
          {queueName ? `Проблемные задачи - ${queueName}` : "Проблемные задачи"}
        </Typography>

        <List sx={{ p: 0 }}>
          {jobs.map((job, index) => {
            const isExpanded = expandedJobs.has(job.id);

            return (
              <Box key={job.id}>
                <ListItem
                  sx={{
                    borderRadius: 2,
                    mb: 1,
                    bgcolor: "#ffebee",
                    border: "1px solid #ef535050",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: "#ffcdd2",
                      borderColor: "#ef5350",
                    },
                  }}
                >
                  <Box display="flex" width="100%" alignItems="flex-start" gap={1}>
                    <Box flex={1}>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} mb={1}>
                            <ErrorIcon sx={{ color: "#f44336" }} />
                            <Typography variant="body1" fontWeight="medium">
                              {job.name}
                            </Typography>
                            <Chip
                              label={job.queueName}
                              size="small"
                              sx={{
                                bgcolor: "#9c27b0",
                                color: "white",
                                fontWeight: "bold",
                              }}
                            />
                            <Chip
                              label={`Попыток: ${job.attemptsMade}`}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography
                              variant="body2"
                              color="error"
                              sx={{
                                bgcolor: "rgba(244, 67, 54, 0.1)",
                                p: 1,
                                borderRadius: 1,
                                fontFamily: "monospace",
                                mb: 1,
                              }}
                            >
                              {job.failedReason}
                            </Typography>

                            <Box display="flex" alignItems="center" gap={2}>
                              <Box display="flex" alignItems="center" gap={0.5}>
                                <TimeIcon fontSize="small" color="action" />
                                <Typography variant="caption" color="text.secondary">
                                  {formatDistanceToNow(new Date(job.timestamp), {
                                    addSuffix: true,
                                    locale: ru,
                                  })}
                                </Typography>
                              </Box>

                              <Typography variant="caption" color="text.secondary">
                                ID: {job.id}
                              </Typography>
                            </Box>
                          </Box>
                        }
                      />
                    </Box>

                    <Box display="flex" gap={0.5}>
                      <Tooltip title="Повторить">
                        <IconButton
                          size="small"
                          onClick={() => handleRetry(job)}
                          disabled={retryJob.isPending}
                          sx={{ color: "#4caf50" }}
                        >
                          <RetryIcon />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Продвинуть">
                        <IconButton
                          size="small"
                          onClick={() => handlePromote(job)}
                          disabled={retryJob.isPending}
                          sx={{ color: "#2196f3" }}
                        >
                          <PromoteIcon />
                        </IconButton>
                      </Tooltip>

                      <Tooltip title="Удалить">
                        <IconButton
                          size="small"
                          onClick={() => handleRemove(job)}
                          disabled={retryJob.isPending}
                          sx={{ color: "#f44336" }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>

                      <IconButton
                        size="small"
                        onClick={() => toggleExpand(job.id)}
                        sx={{
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.3s",
                        }}
                      >
                        <ExpandIcon />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Детали задачи */}
                  <Collapse in={isExpanded} sx={{ width: "100%", mt: isExpanded ? 2 : 0 }}>
                    <Divider sx={{ mb: 2 }} />

                    {/* Данные задачи */}
                    <Box mb={2}>
                      <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                        <CodeIcon fontSize="small" color="action" />
                        <Typography variant="subtitle2" fontWeight="bold">
                          Данные задачи:
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          bgcolor: "#263238",
                          color: "#aed581",
                          p: 2,
                          borderRadius: 1,
                          fontFamily: "monospace",
                          fontSize: "0.875rem",
                          overflowX: "auto",
                        }}
                      >
                        <pre>{JSON.stringify(job.data, null, 2)}</pre>
                      </Box>
                    </Box>

                    {/* Stacktrace */}
                    {job.stacktrace && job.stacktrace.length > 0 && (
                      <Box>
                        <Typography variant="subtitle2" fontWeight="bold" mb={1}>
                          Stacktrace:
                        </Typography>
                        <Box
                          sx={{
                            bgcolor: "#263238",
                            color: "#ff8a80",
                            p: 2,
                            borderRadius: 1,
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                            overflowX: "auto",
                            maxHeight: 300,
                            overflow: "auto",
                          }}
                        >
                          {job.stacktrace.map((line, i) => (
                            <div key={i}>{line}</div>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Collapse>
                </ListItem>

                {index < jobs.length - 1 && <Divider sx={{ my: 1 }} />}
              </Box>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
}
