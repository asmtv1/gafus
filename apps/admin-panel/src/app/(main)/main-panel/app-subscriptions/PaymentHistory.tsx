"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type {
  AppSubscriptionPaymentHistoryItem,
  AppSubscriptionPaymentHistoryPage,
} from "@gafus/core/services/appSubscription";
import { getAppSubscriptionPlanLabel } from "@gafus/core/services/appSubscription/plans";

const statusLabels: Record<string, string> = {
  all: "Все статусы",
  SUCCEEDED: "Успешно",
  PENDING: "Ожидает",
  CANCELED: "Отменён",
  FAILED: "Ошибка",
  REFUNDED: "Возврат",
};

function moscowDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function money(value: number | null, currency = "RUB") {
  if (value == null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function Snapshot({ payment }: { payment: AppSubscriptionPaymentHistoryItem }) {
  return (
    <Box sx={{ minWidth: 170, overflowWrap: "anywhere" }}>
      <Typography variant="body2">Код: {payment.promoCodeSnapshot ?? "—"}</Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Скидка: {payment.promoDiscountPercent == null ? "—" : `${payment.promoDiscountPercent}%`}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Исходная: {money(payment.originalAmountRub, payment.currency ?? "RUB")}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Итоговая: {money(payment.amountRub, payment.currency ?? "RUB")}
      </Typography>
    </Box>
  );
}

export default function PaymentHistory({
  history,
  status,
  search,
}: {
  history: AppSubscriptionPaymentHistoryPage;
  status: string;
  search: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(search);

  const navigate = (changes: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams({ tab: "payments" });
    const nextStatus = changes.paymentStatus ?? status;
    const nextSearch = changes.paymentSearch ?? search;
    const nextPage = changes.paymentPage ?? history.page;
    const nextPageSize = changes.paymentPageSize ?? history.pageSize;
    if (nextStatus && nextStatus !== "all") params.set("paymentStatus", String(nextStatus));
    if (nextSearch) params.set("paymentSearch", String(nextSearch));
    params.set("paymentPage", String(nextPage));
    params.set("paymentPageSize", String(nextPageSize));
    router.replace(`/main-panel/app-subscriptions?${params.toString()}`);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate({ paymentSearch: query.trim(), paymentPage: 1 });
  };

  return (
    <Paper sx={{ width: "100%", overflow: "hidden" }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          История платежей
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Суммы и промокод показаны из неизменяемого snapshot платежа.
        </Typography>
        <Box
          component="form"
          onSubmit={submitSearch}
          sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.5 }}
        >
          <TextField
            label="Пользователь, промокод или ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputProps={{ maxLength: 128 }}
            fullWidth
          />
          <FormControl sx={{ minWidth: { xs: "100%", md: 190 } }}>
            <InputLabel id="payment-status-label">Статус</InputLabel>
            <Select
              labelId="payment-status-label"
              value={status}
              label="Статус"
              onChange={(event) => navigate({ paymentStatus: event.target.value, paymentPage: 1 })}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button type="submit" variant="contained" sx={{ minWidth: 120 }}>
            Найти
          </Button>
        </Box>
      </Box>

      <TableContainer sx={{ display: { xs: "none", md: "block" }, maxHeight: 680 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Пользователь</TableCell>
              <TableCell>Платёж</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Snapshot</TableCell>
              <TableCell>Дата</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.items.map((payment) => (
              <TableRow key={payment.id} hover>
                <TableCell sx={{ maxWidth: 240, overflowWrap: "anywhere" }}>
                  <Typography variant="subtitle2">
                    {payment.user.fullName ?? payment.user.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    @{payment.user.username}
                  </Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 240, overflowWrap: "anywhere" }}>
                  <Typography variant="body2">{payment.id}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {payment.provider} · {getAppSubscriptionPlanLabel(payment.planCode)} · {payment.kind}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    YooKassa: {payment.yookassaPaymentId ?? "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={statusLabels[payment.status] ?? payment.status} />
                  {payment.failureReason ? (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                      {payment.failureReason}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Snapshot payment={payment} />
                </TableCell>
                <TableCell>{moscowDate(payment.succeededAt ?? payment.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.5, p: 2 }}>
        {history.items.map((payment) => (
          <Paper key={payment.id} variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
                {payment.user.fullName ?? payment.user.username}
              </Typography>
              <Chip size="small" label={statusLabels[payment.status] ?? payment.status} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {getAppSubscriptionPlanLabel(payment.planCode)} · {payment.id} · {moscowDate(payment.succeededAt ?? payment.createdAt)}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Snapshot payment={payment} />
            </Box>
          </Paper>
        ))}
      </Box>

      {history.items.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          Платежи не найдены.
        </Typography>
      ) : null}
      <TablePagination
        component="div"
        count={history.total}
        page={Math.min(history.page - 1, Math.max(0, history.totalPages - 1))}
        rowsPerPage={history.pageSize}
        rowsPerPageOptions={[10, 25, 50, 100]}
        onPageChange={(_event, page) => navigate({ paymentPage: page + 1 })}
        onRowsPerPageChange={(event) =>
          navigate({ paymentPageSize: Number(event.target.value), paymentPage: 1 })
        }
        labelRowsPerPage="Строк на странице:"
      />
    </Paper>
  );
}
