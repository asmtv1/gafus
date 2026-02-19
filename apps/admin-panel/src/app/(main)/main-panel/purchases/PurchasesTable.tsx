"use client";

import { useState } from "react";

import {
  Avatar,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@/utils/muiImports";
import { ArrowDownwardIcon, ArrowUpwardIcon, SearchIcon, UnfoldMoreIcon } from "@/utils/muiImports";

import type { PurchaseRow } from "@/features/purchases/lib/getAllPurchases";

type SortField = "createdAt" | "amountRub" | "status" | "user" | "course" | null;
type SortDirection = "asc" | "desc";

interface PurchasesTableProps {
  purchases: PurchaseRow[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const statusLabels: Record<string, string> = {
  PENDING: "Ожидает",
  SUCCEEDED: "Оплачен",
  CANCELED: "Отменён",
  REFUNDED: "Возврат",
};

const statusColors: Record<string, "default" | "success" | "warning" | "error"> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  CANCELED: "default",
  REFUNDED: "error",
};

export default function PurchasesTable({
  purchases,
  searchQuery,
  onSearchChange,
  sortField,
  sortDirection,
  onSort,
}: PurchasesTableProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 11 && cleaned.startsWith("7")) {
      const match = cleaned.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
      if (match) {
        return `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`;
      }
    }
    return phone;
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <UnfoldMoreIcon sx={{ fontSize: 16, opacity: 0.5 }} />;
    }
    return sortDirection === "asc" ? (
      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
    ) : (
      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
    );
  };

  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const slice = purchases.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Paper sx={{ width: "100%", overflow: "hidden" }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Поиск по пользователю, курсу, ID..."
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ maxWidth: { xs: "100%", sm: 400 } }}
        />
      </Box>
      <TableContainer
        sx={{
          maxHeight: { xs: "none", sm: 600 },
          display: { xs: "none", sm: "block" },
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { opacity: 0.7 },
                  }}
                  onClick={() => onSort("user")}
                >
                  <Typography variant="subtitle2" fontWeight="bold">
                    Покупатель
                  </Typography>
                  {getSortIcon("user")}
                </Box>
              </TableCell>
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { opacity: 0.7 },
                  }}
                  onClick={() => onSort("course")}
                >
                  <Typography variant="subtitle2" fontWeight="bold">
                    Курс
                  </Typography>
                  {getSortIcon("course")}
                </Box>
              </TableCell>
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { opacity: 0.7 },
                  }}
                  onClick={() => onSort("amountRub")}
                >
                  <Typography variant="subtitle2" fontWeight="bold">
                    Сумма
                  </Typography>
                  {getSortIcon("amountRub")}
                </Box>
              </TableCell>
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { opacity: 0.7 },
                  }}
                  onClick={() => onSort("status")}
                >
                  <Typography variant="subtitle2" fontWeight="bold">
                    Статус
                  </Typography>
                  {getSortIcon("status")}
                </Box>
              </TableCell>
              <TableCell>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { opacity: 0.7 },
                  }}
                  onClick={() => onSort("createdAt")}
                >
                  <Typography variant="subtitle2" fontWeight="bold">
                    Дата оплаты
                  </Typography>
                  {getSortIcon("createdAt")}
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  ID платежа / ЮKassa
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slice.map((row) => (
              <TableRow hover key={row.id}>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Avatar
                      src={row.user.profile?.avatarUrl || "/uploads/avatar.svg"}
                      alt={row.user.username}
                      sx={{ width: 32, height: 32 }}
                    />
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {row.user.profile?.fullName || row.user.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @{row.user.username}
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        {formatPhone(row.user.phone ?? "")}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {row.course.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.course.type}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {row.amountRub.toFixed(2)} {row.currency}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={statusLabels[row.status] ?? row.status}
                    color={statusColors[row.status] ?? "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(row.createdAt)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" fontFamily="monospace" display="block">
                    {row.id}
                  </Typography>
                  {row.yookassaPaymentId && (
                    <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                      {row.yookassaPaymentId}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={purchases.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}-${to} из ${count !== -1 ? count : `более ${to}`}`
        }
      />

      {/* Мобильный вид — карточки */}
      <Box sx={{ display: { xs: "block", sm: "none" }, p: 2 }}>
        {slice.map((row) => (
          <Paper
            key={row.id}
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              boxShadow: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Avatar
                src={row.user.profile?.avatarUrl || "/uploads/avatar.svg"}
                alt={row.user.username}
                sx={{ width: 48, height: 48 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight="medium" noWrap>
                  {row.user.profile?.fullName || row.user.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  @{row.user.username} · {formatPhone(row.user.phone ?? "")}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Курс
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {row.course.name} ({row.course.type})
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Сумма
                </Typography>
                <Typography variant="body2">
                  {row.amountRub.toFixed(2)} {row.currency}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Статус
                </Typography>
                <Chip
                  label={statusLabels[row.status] ?? row.status}
                  color={statusColors[row.status] ?? "default"}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Дата оплаты
                </Typography>
                <Typography variant="body2">{formatDate(row.createdAt)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  ID платежа
                </Typography>
                <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: "break-all" }}>
                  {row.id}
                </Typography>
                {row.yookassaPaymentId && (
                  <Typography variant="caption" fontFamily="monospace" color="text.secondary" display="block">
                    ЮKassa: {row.yookassaPaymentId}
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handlePageChange(null, Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Назад
            </Button>
            <Typography variant="body2" sx={{ px: 2 }}>
              {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, purchases.length)} из{" "}
              {purchases.length}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() =>
                handlePageChange(null, Math.min(Math.ceil(purchases.length / rowsPerPage) - 1, page + 1))
              }
              disabled={page >= Math.ceil(purchases.length / rowsPerPage) - 1}
            >
              Вперед
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
