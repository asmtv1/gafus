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
import type {
  AppSubscriptionDashboard,
  AppSubscriptionDashboardRow,
} from "@/features/app-subscriptions/lib/getAppSubscriptionDashboard";
import { getAppSubscriptionStatusLabel } from "@/features/app-subscriptions/lib/statusPresentation";
import {
  getAppSubscriptionPlanLabel,
  type AppSubscriptionAdminDashboardMetrics,
} from "@gafus/core/services/appSubscription";

export type AppSubscriptionFilter = "all" | "active" | "not_renewed" | "past_due";

type SortField = "boughtAt" | "activeUntil" | "lastPaymentAt" | "totalPaidRub" | "status" | "user";
type SortDirection = "asc" | "desc";

interface AppSubscriptionsTableProps {
  metrics: AppSubscriptionAdminDashboardMetrics;
  todayNotPaid: AppSubscriptionDashboard["todayNotPaid"];
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

const filterLabels: { value: AppSubscriptionFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "not_renewed", label: "Не продлили" },
  { value: "past_due", label: "Проблема оплаты" },
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

function formatMoscowDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatApplePrice(row: AppSubscriptionDashboardRow) {
  const apple = row.apple;
  if (!apple) return null;
  if (apple.price != null && apple.price > 0 && apple.currency) {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: apple.currency,
      maximumFractionDigits: 2,
    }).format(apple.price);
  }
  return "Apple не передал цену";
}

function AppleDetails({ row }: { row: AppSubscriptionDashboardRow }) {
  const apple = row.apple;
  if (!apple) {
    return null;
  }

  const syncText = apple.lastServerSyncStatus
    ? `${apple.lastServerSyncStatus}${apple.lastServerSyncAt ? `, ${formatDate(apple.lastServerSyncAt)}` : ""}`
    : "не запускался";
  const contextText = [apple.environment, apple.storefront].filter(Boolean).join(" · ");
  const idLines = [
    apple.transactionId ? ["tx", apple.transactionId] : null,
    apple.originalTransactionId ? ["orig", apple.originalTransactionId] : null,
    apple.webOrderLineItemId ? ["web order", apple.webOrderLineItemId] : null,
  ].filter((line): line is [string, string] => Boolean(line));

  return (
    <Box sx={{ maxWidth: 260, minWidth: 190 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        title={apple.productId ?? undefined}
        sx={{
          maxWidth: 240,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {apple.productId ?? "Apple product не указан"}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center", mt: 0.5 }}>
        <Chip size="small" variant="outlined" label={formatApplePrice(row)} />
        {contextText ? <Chip size="small" variant="outlined" label={contextText} /> : null}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mt: 0.5, whiteSpace: "nowrap" }}
      >
        Sync: {syncText}
      </Typography>
      {idLines.length > 0 ? (
        <Box
          component="details"
          sx={{
            mt: 0.25,
            "& summary": {
              cursor: "pointer",
              color: "primary.main",
              display: "inline-flex",
              fontSize: "0.75rem",
              lineHeight: 1.5,
              listStyle: "none",
              userSelect: "none",
            },
            "& summary::-webkit-details-marker": { display: "none" },
          }}
        >
          <Box component="summary">ID</Box>
          <Box sx={{ mt: 0.25 }}>
            {idLines.map(([label, value]) => (
              <Typography
                key={label}
                variant="caption"
                color="text.secondary"
                display="block"
                title={value}
                sx={{
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label}: {value}
              </Typography>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

function getStatusColor(
  row: AppSubscriptionDashboardRow,
): "success" | "warning" | "error" | "default" {
  if (row.attention === "past_due") return "error";
  if (row.attention === "not_renewed") return "default";
  if (row.attention === "cancel_at_period_end") return "warning";
  if (row.isActiveNow) return "success";
  return "default";
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
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

const checkoutStatusLabels: Record<
  AppSubscriptionDashboard["todayNotPaid"][number]["status"],
  string
> = {
  PENDING: "Ожидает оплаты",
  CANCELED: "Отменена",
  FAILED: "Ошибка оплаты",
};

function TodayCheckoutSummary({
  metrics,
  attempts,
}: {
  metrics: AppSubscriptionAdminDashboardMetrics;
  attempts: AppSubscriptionDashboard["todayNotPaid"];
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Сегодня
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Оформление через YooKassa по московскому времени
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
            gap: 1,
            mt: 2,
          }}
        >
          <MetricCard label="Начали оформление" value={metrics.todayCheckoutStarted} hint="Людей" />
          <MetricCard label="Оплатили" value={metrics.todayCheckoutPaid} hint="Людей" />
          <MetricCard label="Пока не оплатили" value={metrics.todayCheckoutNotPaid} hint="Людей" />
        </Box>
      </Box>

      <Box sx={{ borderTop: 1, borderColor: "divider" }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ px: 2, pt: 2 }}>
          Кто пока не оплатил
        </Typography>
        {attempts.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            Сегодня таких пользователей нет.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {attempts.map((attempt) => {
              const contacts = [attempt.user.email, attempt.user.phone].filter(Boolean).join(" · ");

              return (
                <Box
                  key={attempt.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "minmax(220px, 1fr) auto auto auto" },
                    alignItems: { xs: "flex-start", md: "center" },
                    gap: { xs: 0.75, md: 2 },
                    px: 2,
                    py: 1.5,
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2">
                      {attempt.user.fullName ?? attempt.user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      @{attempt.user.username}
                      {contacts ? ` · ${contacts}` : ""}
                    </Typography>
                  </Box>
                  <Typography variant="body2">
                    {formatMoscowDate(attempt.attemptedAt)}
                    {attempt.attemptsCount > 1 ? ` · попыток: ${attempt.attemptsCount}` : ""}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={checkoutStatusLabels[attempt.status]}
                  />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Итог: {formatMoney(attempt.amountRub)}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        Код: {attempt.promoCodeSnapshot ?? "—"} · скидка:{" "}
                        {attempt.promoDiscountPercent == null
                          ? "—"
                          : `${attempt.promoDiscountPercent}%`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Исходная:{" "}
                        {attempt.originalAmountRub == null
                          ? "—"
                          : formatMoney(attempt.originalAmountRub)}
                      </Typography>
                    </Box>
                    <Link
                      href={`/main-panel/users?search=${encodeURIComponent(attempt.user.username)}`}
                    >
                      <Button size="small">Открыть</Button>
                    </Link>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

export default function AppSubscriptionsTable({
  metrics,
  todayNotPaid,
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
      <TodayCheckoutSummary metrics={metrics} attempts={todayNotPaid} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(4, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        <MetricCard
          label="Активные подписки"
          value={metrics.activeNow}
          hint="Есть доступ прямо сейчас"
        />
        <MetricCard
          label="Не продлили"
          value={metrics.notRenewed}
          hint="Ранее была успешная оплата"
        />
        <MetricCard label="Проблема оплаты" value={metrics.pastDue} hint="Требуют внимания" />
        <MetricCard label="Выручка за всё время" value={formatMoney(metrics.totalRevenueRub)} />
      </Box>

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Найти пользователя по имени, email или телефону"
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

        <TableContainer
          sx={{ maxHeight: { xs: "none", md: 680 }, display: { xs: "none", md: "block" } }}
        >
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{sortableHeader("user", "Пользователь")}</TableCell>
                <TableCell>{sortableHeader("status", "Статус")}</TableCell>
                <TableCell>{sortableHeader("boughtAt", "Начало")}</TableCell>
                <TableCell>{sortableHeader("activeUntil", "Заканчивается")}</TableCell>
                <TableCell>{sortableHeader("totalPaidRub", "Оплачено")}</TableCell>
                <TableCell>Детали</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="subtitle2">
                      {row.user.fullName ?? row.user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      @{row.user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {[row.user.email, row.user.phone].filter(Boolean).join(" · ") ||
                        "Контакты не указаны"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.75,
                        alignItems: "flex-start",
                      }}
                    >
                      <Chip
                        size="small"
                        color={getStatusColor(row)}
                        label={getAppSubscriptionStatusLabel(row)}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {providerLabels[row.provider] ?? row.provider} · {getAppSubscriptionPlanLabel(row.planCode)}
                      </Typography>
                      {row.attention ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={attentionLabels[row.attention]}
                        />
                      ) : null}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(row.boughtAt)}</TableCell>
                  <TableCell>{row.isLifetime ? "Навсегда" : formatDate(row.activeUntil)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatMoney(row.totalPaidRub)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.paymentsCount} оплат
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Последняя: {formatDate(row.lastPaymentAt)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {row.provider === "APPLE" ? (
                      <AppleDetails row={row} />
                    ) : (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.paymentMethod ?? row.manualReason ?? "—"}
                      </Typography>
                    )}
                    <Link
                      href={`/main-panel/users?search=${encodeURIComponent(row.user.username)}`}
                    >
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

        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            flexDirection: "column",
            gap: 1.5,
            p: 2,
            pt: 0,
          }}
        >
          {visibleRows.map((row) => (
            <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 1,
                  alignItems: "flex-start",
                }}
              >
                <Box>
                  <Typography variant="subtitle2">
                    {row.user.fullName ?? row.user.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    @{row.user.username}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color={getStatusColor(row)}
                  label={getAppSubscriptionStatusLabel(row)}
                />
              </Box>
              <Typography variant="body2" sx={{ mt: 1 }}>
                {providerLabels[row.provider] ?? row.provider} · {getAppSubscriptionPlanLabel(row.planCode)} · купил {formatDate(row.boughtAt)}
              </Typography>
              <Typography variant="body2">
                До: {row.isLifetime ? "навсегда" : formatDate(row.activeUntil)}
              </Typography>
              <Typography variant="body2">
                Оплачено: {formatMoney(row.totalPaidRub)} · {row.paymentsCount} оплат
              </Typography>
              {row.attention ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={attentionLabels[row.attention]}
                  sx={{ mt: 1 }}
                />
              ) : null}
              {row.provider === "APPLE" ? <AppleDetails row={row} /> : null}
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
