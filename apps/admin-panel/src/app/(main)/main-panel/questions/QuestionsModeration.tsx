"use client";
import { useState } from "react";
import { Box, Button, Typography, Alert, TextField, Stack, Divider } from "@mui/material";
import type { QuestionModerationDto } from "@gafus/types";
import { loadQuestionModeration, moderateQuestion, unblockQuestionUser } from "./actions";
export function QuestionsModeration({ initial }: { initial: QuestionModerationDto }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("Нарушение правил раздела");
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setData(await loadQuestionModeration());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box sx={{ maxWidth: 1000 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Вопросы: модерация
      </Typography>
      <Typography sx={{ mb: 3 }}>
        Публикации появляются сразу. Блокировка запрещает публикации только в разделе «Вопросы».
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TextField
        label="Причина решения / блокировки"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        fullWidth
        inputProps={{ maxLength: 1000 }}
        sx={{ mb: 3 }}
      />
      {!data.reports.length && <Alert severity="info">Новых жалоб нет</Alert>}
      {data.reports.map((report) => (
        <Box key={report.id} sx={{ py: 3 }}>
          <Typography variant="h6">{report.questionTitle}</Typography>
          <Typography variant="body2" color="text.secondary">
            {report.answerId ? "Ответ" : "Вопрос"} от {report.author.name} · Жалоба от{" "}
            {report.reporter.name} · {new Date(report.createdAt).toLocaleString("ru-RU")}
          </Typography>
          <Typography sx={{ my: 2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {report.body}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
            {report.photos.map((photo, index) => (
              <Box
                key={photo.id}
                component="a"
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Box
                  component="img"
                  src={photo.url}
                  alt={`Фото публикации ${index + 1}`}
                  sx={{ width: 160, height: 160, objectFit: "cover", borderRadius: 1 }}
                />
              </Box>
            ))}
          </Stack>
          <Alert severity="warning">
            {report.reason}
            {report.details ? `: ${report.details}` : ""}
          </Alert>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ my: 2 }}>
            {(
              [
                ["dismiss", "Отклонить жалобу"],
                ["hide", "Скрыть публикацию"],
                ["delete", "Удалить публикацию"],
                ["close", "Закрыть обсуждение"],
                ["block", "Заблокировать автора в вопросах"],
              ] as const
            ).map(([action, label]) => (
              <Button
                key={action}
                variant="outlined"
                disabled={busy || !reason.trim()}
                onClick={() => {
                  if (action !== "dismiss" && !window.confirm(`${label}?`)) return;
                  void run(() => moderateQuestion({ reportId: report.id, action, reason }));
                }}
              >
                {label}
              </Button>
            ))}
          </Stack>
          <Divider />
        </Box>
      ))}
      {data.nextPage && (
        <Button
          disabled={busy}
          onClick={() =>
            void (async () => {
              setBusy(true);
              try {
                const next = await loadQuestionModeration(data.nextPage!);
                setData((v) => ({ ...next, reports: [...v.reports, ...next.reports] }));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Не удалось загрузить жалобы");
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          Ещё жалобы
        </Button>
      )}
      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
        Блокировки в вопросах
      </Typography>
      {!data.blocks.length && <Typography>Блокировок нет</Typography>}
      {data.blocks.map((block) => (
        <Box key={block.userId} sx={{ py: 2 }}>
          <Typography fontWeight={600}>{block.name}</Typography>
          <Typography>{block.reason}</Typography>
          <Button disabled={busy} onClick={() => void run(() => unblockQuestionUser(block.userId))}>
            Снять блокировку
          </Button>
        </Box>
      ))}
    </Box>
  );
}
