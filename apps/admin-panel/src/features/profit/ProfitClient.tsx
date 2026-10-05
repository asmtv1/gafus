"use client";

import { useState, useTransition } from "react";
import { reportClientError } from "@gafus/error-handling";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { ProfitDashboard, ProfitVideoRow } from "@gafus/core/services/appSubscription";
import { cancelVideoExpenseAction, saveVideoExpenseAction } from "./profitActions";

const money = (value: number | null) =>
  value === null
    ? "Нет данных"
    : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value / 100);
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Samara",
        dateStyle: "short",
      }).format(new Date(value))
    : "Дата не сверена";
const methodLabel = (method: string | null) => {
  const labels: Record<string, string> = {
    bank_card: "Банковская карта",
    sbp: "СБП",
    sberbank: "SberPay",
    tinkoff_bank: "T-Pay",
    yoo_money: "ЮMoney",
    b2b_sberbank: "СберБанк Бизнес Онлайн",
  };
  return method ? (labels[method] ?? method) : "Не определён";
};
type FormState = {
  requestKey: string;
  id?: string;
  version?: number;
  partnerId: string;
  paidDay: string;
  quantity: string;
  comment: string;
};

export default function ProfitClient({
  data,
  periodError,
}: {
  data: ProfitDashboard;
  periodError?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [form, setForm] = useState<FormState | null>(null);
  const [cancel, setCancel] = useState<ProfitVideoRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = (start: string, end: string, paymentPage = 1, videoPage = 1) => {
    const query = new URLSearchParams({
      from: start,
      to: end,
      paymentPage: String(paymentPage),
      videoPage: String(videoPage),
    });
    startTransition(() => router.replace(`/main-panel/profit?${query}`, { scroll: false }));
  };
  const openForm = (row?: ProfitVideoRow) => {
    setError(null);
    setForm({
      requestKey: crypto.randomUUID(),
      id: row?.id,
      version: row?.version,
      partnerId: row?.partnerId ?? data.partners.find((p) => p.active)?.id ?? "",
      paidDay: row?.paidDay ?? data.today,
      quantity: String(row?.quantity ?? 1),
      comment: row?.comment ?? "",
    });
  };
  const save = () => {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveVideoExpenseAction({
          requestKey: form.requestKey,
          id: form.id,
          version: form.version,
          input: {
            partnerId: form.partnerId,
            paidDay: form.paidDay,
            quantity: Number(form.quantity),
            comment: form.comment,
          },
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setForm(null);
        setNotice("Расход на видео сохранён");
        router.refresh();
      } catch (saveError) {
        reportClientError(saveError, {
          issueKey: "ProfitVideoExpense",
          keys: { operation: "save" },
        });
        setError("Не удалось сохранить расход. Попробуйте ещё раз");
      }
    });
  };
  const cancelExpense = () => {
    if (!cancel) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelVideoExpenseAction({ id: cancel.id, version: cancel.version });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setCancel(null);
        setNotice("Запись отменена и исключена из расходов");
        router.refresh();
      } catch (cancelError) {
        reportClientError(cancelError, {
          issueKey: "ProfitVideoExpense",
          keys: { operation: "cancel" },
        });
        setError("Не удалось отменить запись. Попробуйте ещё раз");
      }
    });
  };
  const totals = [
    ["Оплаты подписок", data.totals.payments],
    ["Возвраты", data.totals.refunds],
    ["ЮKassa, включая НДС с комиссии", data.totals.yookassa],
    ["НПД, расчёт 4% без вычета", data.totals.npd],
    ["Начислено креаторам за подписчиков", data.totals.partners],
    ["Оплаты видео", data.totals.videos],
    ["Сервер", data.totals.server],
  ] as const;
  const validQuantity =
    form &&
    Number.isInteger(Number(form.quantity)) &&
    Number(form.quantity) > 0 &&
    Number(form.quantity) <= 10_000;

  return (
    <Stack spacing={3} aria-busy={pending}>
      {periodError && <Alert severity="warning">{periodError}. Показан текущий месяц.</Alert>}
      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      <Stack
        component="form"
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
        onSubmit={(event) => {
          event.preventDefault();
          navigate(from, to);
        }}
      >
        <TextField
          label="С"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: "2026-09-01", max: to } }}
        />
        <TextField
          label="По"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from, max: data.today } }}
        />
        <Button type="submit" variant="contained" disabled={pending}>
          Показать
        </Button>
        <Button
          variant="outlined"
          disabled={pending}
          onClick={() => {
            const start = data.today.slice(0, 7) + "-01";
            setFrom(start);
            setTo(data.today);
            navigate(start, data.today);
          }}
        >
          Текущий месяц
        </Button>
        <Button
          variant="outlined"
          disabled={pending}
          onClick={() => {
            setFrom("2026-09-01");
            setTo(data.today);
            navigate("2026-09-01", data.today);
          }}
        >
          За всё время
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography color="text.secondary">
          {dateLabel(`${data.from}T00:00:00+04:00`)} — {dateLabel(`${data.to}T00:00:00+04:00`)}
        </Typography>
        <Typography variant="h5" sx={{ mt: 1 }}>
          {data.profitKopecks === null
            ? "Расчёт пока неполный"
            : data.profitKopecks < 0
              ? "Убыток"
              : "Прибыль"}
        </Typography>
        <Typography
          variant="h4"
          fontWeight={700}
          sx={{ my: 1, overflowWrap: "anywhere" }}
          color={
            data.profitKopecks === null
              ? "text.secondary"
              : data.profitKopecks < 0
                ? "error.main"
                : "success.main"
          }
        >
          {data.profitKopecks === null ? "Итог ожидает сверки" : money(data.profitKopecks)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Оплаты за вычетом возвратов, удержаний ЮKassa, расчётного налога и расходов.
        </Typography>
      </Paper>
      {data.profitKopecks === null && (
        <Alert severity="warning">
          Финансовые данные требуют сверки. Неполных платежей: {data.incompletePayments}; без
          комиссии: {data.missingFees}; без даты оплаты: {data.undatedPayments}. Известные суммы
          показаны ниже, окончательная прибыль пока не определена.
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        {totals.map(([label, value]) => (
          <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h6" sx={{ mt: 1, overflowWrap: "anywhere" }}>
              {money(value)}
            </Typography>
            {label === "Сервер" && (
              <Typography variant="caption" color="text.secondary">
                429 ₽ ежемесячно, 18-го числа
              </Typography>
            )}
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ sm: "center" }}
          spacing={2}
          sx={{ p: 2 }}
        >
          <Typography variant="h6">Оплаты видео</Typography>
          <Button
            variant="contained"
            disabled={pending || !data.partners.length}
            onClick={() => openForm()}
          >
            Добавить оплату видео
          </Button>
        </Stack>
        {!data.partners.length && (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            Сначала назначьте креатору роль «Партнёр» в разделе пользователей.
          </Alert>
        )}
        <TableContainer>
          <Table size="small" aria-label="История расходов на видео">
            <TableHead>
              <TableRow>
                {["Дата выплаты", "Креатор", "Видео", "Сумма", "Комментарий", "Действия"].map(
                  (label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {!data.videos.length && (
                <TableRow>
                  <TableCell colSpan={6}>За этот период оплат видео нет.</TableCell>
                </TableRow>
              )}
              {data.videos.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {dateLabel(`${row.paidDay}T00:00:00+04:00`)}
                  </TableCell>
                  <TableCell sx={{ overflowWrap: "anywhere", minWidth: 120 }}>
                    {row.partnerName}
                  </TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell
                    sx={{
                      whiteSpace: "nowrap",
                      textDecoration: row.canceled ? "line-through" : undefined,
                    }}
                  >
                    {money(row.amountKopecks)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 140, maxWidth: 260, overflowWrap: "anywhere" }}>
                    {row.comment || "—"}
                  </TableCell>
                  <TableCell>
                    {row.canceled ? (
                      <Chip size="small" label="Отменено" />
                    ) : (
                      <Stack direction="row" spacing={1}>
                        <Button size="small" disabled={pending} onClick={() => openForm(row)}>
                          Изменить
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={pending}
                          onClick={() => {
                            setError(null);
                            setCancel(row);
                          }}
                        >
                          Отменить
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {data.videoCount > data.pageSize && (
          <Pagination
            sx={{ p: 2 }}
            count={Math.ceil(data.videoCount / data.pageSize)}
            page={data.videoPage}
            disabled={pending}
            onChange={(_, page) => navigate(data.from, data.to, data.paymentPage, page)}
          />
        )}
      </Paper>

      <Paper variant="outlined" sx={{ minWidth: 0 }}>
        <Typography sx={{ p: 2 }} variant="h6">
          Оплаты подписок
        </Typography>
        <TableContainer>
          <Table size="small" aria-label="Детализация оплат подписок">
            <TableHead>
              <TableRow>
                {["Дата", "Оплата", "Способ оплаты", "ЮKassa", "НПД 4%", "Сверка"].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!data.payments.length && (
                <TableRow>
                  <TableCell colSpan={6}>За этот период оплат подписок нет.</TableCell>
                </TableRow>
              )}
              {data.payments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dateLabel(row.date)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{money(row.amountKopecks)}</TableCell>
                  <TableCell>{methodLabel(row.method)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{money(row.feeKopecks)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{money(row.npdKopecks)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={row.complete ? "success" : "warning"}
                      label={row.complete ? "Сверено" : "Нужна сверка"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {data.paymentCount > data.pageSize && (
          <Pagination
            sx={{ p: 2 }}
            count={Math.ceil(data.paymentCount / data.pageSize)}
            page={data.paymentPage}
            disabled={pending}
            onChange={(_, page) => navigate(data.from, data.to, page, data.videoPage)}
          />
        )}
      </Paper>

      <Dialog
        open={!!form}
        onClose={() => {
          if (!pending) setForm(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{form?.id ? "Изменить оплату видео" : "Добавить оплату видео"}</DialogTitle>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                select
                label="Креатор"
                value={form?.partnerId ?? ""}
                required
                disabled={pending}
                onChange={(e) => setForm((f) => f && { ...f, partnerId: e.target.value })}
              >
                {data.partners.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? "" : " (неактивен)"}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Дата выплаты"
                type="date"
                value={form?.paidDay ?? ""}
                required
                disabled={pending}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { min: "2026-09-01", max: data.today },
                }}
                onChange={(e) => setForm((f) => f && { ...f, paidDay: e.target.value })}
              />
              <TextField
                label="Количество видео"
                type="number"
                value={form?.quantity ?? ""}
                required
                disabled={pending}
                slotProps={{ htmlInput: { min: 1, max: 10_000, step: 1 } }}
                onChange={(e) => setForm((f) => f && { ...f, quantity: e.target.value })}
              />
              <Typography>
                500 ₽ за видео · Итого:{" "}
                <strong>{validQuantity ? money(Number(form?.quantity) * 50_000) : "—"}</strong>
              </Typography>
              <TextField
                label="Комментарий (необязательно)"
                multiline
                minRows={2}
                value={form?.comment ?? ""}
                disabled={pending}
                slotProps={{ htmlInput: { maxLength: 512 } }}
                onChange={(e) => setForm((f) => f && { ...f, comment: e.target.value })}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={() => setForm(null)}>
              Закрыть
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pending || !validQuantity || !form?.partnerId}
            >
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog
        open={!!cancel}
        onClose={() => {
          if (!pending) setCancel(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Отменить запись об оплате?</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography>
            {cancel?.partnerName}: {money(cancel?.amountKopecks ?? 0)}. Сумма будет исключена из
            расходов, запись сохранится в истории.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setCancel(null)}>
            Закрыть
          </Button>
          <Button color="error" variant="contained" disabled={pending} onClick={cancelExpense}>
            Отменить запись
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
