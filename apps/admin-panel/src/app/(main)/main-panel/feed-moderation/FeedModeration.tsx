"use client";
import { useState } from "react";
import { Alert, Box, Button, Chip, Divider, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { FEED_REPORT_REASONS } from "@gafus/types";
import PageLayout from "@/shared/components/PageLayout";
import { loadFeedReports, moderateFeedReport } from "./actions";
type Data = Awaited<ReturnType<typeof loadFeedReports>>;
const actions = { dismiss: "Отклонить жалобу", hide: "Скрыть у всех", delete: "Удалить из ленты", restore: "Восстановить контент", block: "Запретить публикации и комментарии", unblock: "Вернуть право публиковать" };
function Report({ report, refresh }: { report: Data["items"][number]; refresh: () => Promise<void> }) {
  const [action, setAction] = useState<keyof typeof actions>("hide");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Box component="article" sx={{ py: 3 }}>
    <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center"><Typography variant="h6">{report.targetType === "post" ? "Публикация" : "Комментарий"} · {report.author?.username ?? "Автор удалён"}</Typography>
      <Chip size="small" label={report.status === "pending" ? "Новая" : "Рассмотрена"} color={report.status === "pending" ? "warning" : "default"} />
      {report.author?.feedPublishingBlocked && <Chip size="small" color="error" label="Публикации запрещены" />}
    </Stack>
    <Typography variant="body2" sx={{ mt: 1 }}>От {report.reporter?.username ?? "Пользователь удалён"} · {new Date(report.createdAt).toLocaleString("ru-RU")}</Typography>
    <Typography sx={{ mt: 1, fontWeight: 600 }}>{FEED_REPORT_REASONS[report.reason as keyof typeof FEED_REPORT_REASONS] ?? report.reason}</Typography>
    {report.comment && <Typography sx={{ my: 1 }}>Комментарий к жалобе: {report.comment}</Typography>}
    <Box component="blockquote" sx={{ mx: 0, p: 2, bgcolor: "action.hover", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      <Typography variant="caption">Текст на момент жалобы</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{report.snapshotText || "Публикация без текста"}</Typography>
    </Box>
    {report.resolution && <Typography variant="body2">Решение: {actions[report.resolution as keyof typeof actions] ?? report.resolution}. {report.resolutionReason}</Typography>}
    <Stack component="form" spacing={2} sx={{ mt: 2, maxWidth: 640 }} onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try { await moderateFeedReport(report.id, { action, reason }); await refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : "Не удалось сохранить решение"); }
      finally { setBusy(false); }
    }}>
      <TextField select label="Действие" value={action} disabled={busy} onChange={event => setAction(event.target.value as keyof typeof actions)}>
        {Object.entries(actions).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
      </TextField>
      <TextField label="Причина решения" required multiline minRows={2} value={reason} disabled={busy} inputProps={{ maxLength: 1000 }} onChange={event => setReason(event.target.value)} helperText="При скрытии или удалении эта причина будет видна автору публикации." />
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" type="submit" disabled={busy || !reason.trim()}>{busy ? "Сохраняем…" : "Применить решение"}</Button>
    </Stack>
  </Box>;
}
export function FeedModeration({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() { setData(await loadFeedReports(cursors[cursors.length - 1])); }
  async function navigate(next: (string | null)[]) {
    setBusy(true); setError("");
    try { setData(await loadFeedReports(next[next.length - 1])); setCursors(next); }
    catch (err) { setError(err instanceof Error ? err.message : "Не удалось загрузить список"); }
    finally { setBusy(false); }
  }
  return <PageLayout title="Модерация ленты" subtitle={`Новых жалоб: ${data.pendingCount}`}>
    <Typography>Проверьте сохранённый текст и выберите действие. Скрытый и удалённый модератором контент можно восстановить. Запрет публикаций действует до его отмены.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Button disabled={busy} onClick={() => void navigate(cursors)}>Обновить</Button>
    {!data.items.length && <Typography sx={{ py: 3 }}>Жалоб пока нет.</Typography>}
    {data.items.map(report => <Box key={report.id}><Report report={report} refresh={refresh} /><Divider /></Box>)}
    <Stack direction="row" gap={2} sx={{ mt: 2 }}>
      {cursors.length > 1 && <Button disabled={busy} onClick={() => void navigate(cursors.slice(0, -1))}>Назад</Button>}
      {data.nextCursor && <Button disabled={busy} onClick={() => void navigate([...cursors, data.nextCursor])}>Следующая страница</Button>}
    </Stack>
  </PageLayout>;
}
