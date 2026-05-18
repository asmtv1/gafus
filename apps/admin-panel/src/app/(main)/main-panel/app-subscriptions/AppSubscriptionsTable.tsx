"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ArrowDownwardIcon,
  ArrowUpwardIcon,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  SearchIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  UnfoldMoreIcon,
} from "@/utils/muiImports";
import type { AppSubscriptionDashboardRow } from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";
import type { AppSubscriptionAdminDashboardMetrics } from "@gafus/core/services/appSubscription";

export type AppSubscriptionFilter =
  | "all"
  | "active"
  | "not_renewed"
  | "cancel_at_period_end"
  | "past_due"
  | "yookassa"
  | "apple"
  | "manual";

type SortField = "boughtAt" | "activeUntil" | "lastPaymentAt" | "totalPaidRub" | "status" | "user";
type SortDirection = "asc" | "desc";

interface AppSubscriptionsTableProps {
  metrics: AppSubscriptionAdminDashboardMetrics;
  rows: AppSubscriptionDashboardRow[];
  totalRows: number;
  filter: AppSubscriptionFilter;
  onFilterChange: (filter: AppSubscriptionFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const providerLabels: Record<string, string> = {
  YOOKASSA: "YooKassa",
  APPLE: "Apple",
  MANUAL: "Manual",
};

const statusLabels: Record<string, string> = {
  PENDING: "Ожидает",
  ACTIVE: "Активна",
  PAST_DUE: "Проблема оплаты",
  CANCELED: "Отменена",
  EXPIRED: "Истекла",
  REFUNDED: "Возврат",
  REVOKED: "Отозвана",
};

const filterLabels: { value: AppSubscriptionFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "not_renewed", label: "Не продлили" },
  { value: "cancel_at_period_end", label: "Отменили автопродление" },
  { value: "past_due", label: "Проблема оплаты" },
  { value: "yookassa", label: "YooKassa" },
  { value: "apple", label: "Apple" },
  { value: "manual", label: "Manual" },
];

const attentionLabels: Record<Exclude<AppSubscriptionDashboardRow["attention"], null>, string> = {
  not_renewed: "Не продлил",
  past_due: "Проблема оплаты",
  cancel_at_period_end: "Отменил автопродление",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getStatusColor(row: AppSubscriptionDashboardRow): "success" | "warning" | "error" | "default" {
  if (row.attention === "past_due") return "error";
  if (row.attention === "not_renewed") return "default";
  if (row.attention === "cancel_at_period_end") return "warning";
  if (row.isActiveNow) return "success";
  return "default";
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minHeight: 94 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
}

export default function AppSubscriptionsTable({
  metrics,
  rows,
  totalRows,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  sortField,
  sortDirection,
  onSort,
}: AppSubscriptionsTableProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const visibleRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <UnfoldMoreIcon sx={{ fontSize: 16, opacity: 0.5 }} />;
    return sortDirection === "asc" ? (
      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
    ) : (
      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
    );
  };

  const sortableHeader = (field: SortField, label: string) => (
    <Box
      onClick={() => onSort(field)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        cursor: "pointer",
        userSelect: "none",
        "&:hover": { opacity: 0.75 },
      }}
    >
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      {sortIcon(field)}
    </Box>
  );

  const resetPageAndFilter = (nextFilter: AppSubscriptionFilter) => {
    onFilterChange(nextFilter);
    setPage(0);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
          gap: 2,
        }}
      >
        <MetricCard label="Активные сейчас" value={metrics.activeNow} hint="Включая lifetime" />
        <MetricCard label="Не продлили" value={metrics.notRenewed} hint="Ранее была успешная оплата" />
        <MetricCard label="Отменили автопродление" value={metrics.cancelAtPeriodEnd} hint="Доступ ещё действует" />
        <MetricCard label="Проблема оплаты" value={metrics.pastDue} hint="Статус PAST_DUE" />
        <MetricCard label="Всего подписок" value={metrics.totalSubscriptions} />
        <MetricCard label="Lifetime" value={metrics.lifetime} />
        <MetricCard label="Успешных оплат" value={metrics.totalSucceededPayments} />
        <MetricCard label="Выручка" value={formatMoney(metrics.totalRevenueRub)} />
      </Box>

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Поиск по пользователю, email, телефону, статусу, провайдеру..."
            value={searchQuery}
            onChange={(event) => {
              onSearchChange(event.target.value);
              setPage(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ maxWidth: { xs: "100%", md: 620 } }}
          />
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {filterLabels.map((item) => (
              <Button
                key={item.value}
                size="small"
                variant={filter === item.value ? "contained" : "outlined"}
                onClick={() => resetPageAndFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Показано {rows.length} из {totalRows}
          </Typography>
        </Box>

        <TableContainer sx={{ maxHeight: { xs: "none", md: 680 }, display: { xs: "none", md: "block" } }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{sortableHeader("user", "Пользователь")}</TableCell>
                <TableCell>Провайдер</TableCell>
                <TableCell>{sortableHeader("status", "Статус")}</TableCell>
                <TableCell>{sortableHeader("boughtAt", "Купил")}</TableCell>
                <TableCell>{sortableHeader("activeUntil", "Заканчивается")}</TableCell>
                <TableCell>{sortableHeader("lastPaymentAt", "Последняя оплата")}</TableCell>
                <TableCell>{sortableHeader("totalPaidRub", "Оплачено")}</TableCell>
                <TableCell>Автопродление</TableCell>
                <TableCell>Детали</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="subtitle2">{row.user.fullName ?? row.user.username}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      @{row.user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {[row.user.email, row.user.phone].filter(Boolean).join(" · ") || "Контакты не указаны"}
                    </Typography>
                  </TableCell>
                  <TableCell>{providerLabels[row.provider] ?? row.provider}</TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, alignItems: "flex-start" }}>
                      <Chip size="small" color={getStatusColor(row)} label={statusLabels[row.status] ?? row.status} />
                      {row.attention ? <Chip size="small" variant="outlined" label={attentionLabels[row.attention]} /> : null}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(row.boughtAt)}</TableCell>
                  <TableCell>{row.isLifetime ? "Навсегда" : formatDate(row.activeUntil)}</TableCell>
                  <TableCell>{formatDate(row.lastPaymentAt)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatMoney(row.totalPaidRub)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.paymentsCount} оплат
                    </Typography>
                  </TableCell>
                  <TableCell>{row.cancelAtPeriodEnd ? "Отключено" : row.provider === "YOOKASSA" ? "Включено" : "—"}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {row.paymentMethod ?? row.appleProductId ?? row.manualReason ?? "—"}
                    </Typography>
                    <Link href={`/main-panel/users?search=${encodeURIComponent(row.user.username)}`}>
                      <Button size="small" sx={{ mt: 0.75 }}>
                        Открыть
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 1.5, p: 2, pt: 0 }}>
          {visibleRows.map((row) => (
            <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                <Box>
                  <Typography variant="subtitle2">{row.user.fullName ?? row.user.username}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    @{row.user.username}
                  </Typography>
                </Box>
                <Chip size="small" color={getStatusColor(row)} label={statusLabels[row.status] ?? row.status} />
              </Box>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {providerLabels[row.provider] ?? row.provider} · купил {formatDate(row.boughtAt)}
              </Typography>
              <Typography variant="body2">
                До: {row.isLifetime ? "навсегда" : formatDate(row.activeUntil)}
              </Typography>
              <Typography variant="body2">
                Оплачено: {formatMoney(row.totalPaidRub)} · {row.paymentsCount} оплат
              </Typography>
              {row.attention ? (
                <Chip size="small" variant="outlined" label={attentionLabels[row.attention]} sx={{ mt: 1 }} />
              ) : null}
            </Paper>
          ))}
        </Box>

        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={rows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_event, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Строк на странице:"
        />
      </Paper>
    </Box>
  );
}
