"use client";

import { useState } from "react";

import {
  Avatar,
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@/utils/muiImports";
import { DeleteIcon, EditIcon } from "@/utils/muiImports";

interface User {
  id: string;
  username: string;
  phone: string;
  role: string;
  isConfirmed: boolean;
  createdAt: Date;
  profile?: {
    fullName?: string | null;
    avatarUrl?: string | null;
  } | null;
}

interface UsersTableProps {
  users: User[];
  onEditUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

const roleColors = {
  USER: "default",
  TRAINER: "primary",
  MODERATOR: "warning",
  ADMIN: "error",
  PREMIUM: "success",
} as const;

const roleLabels = {
  USER: "Пользователь",
  TRAINER: "Тренер",
  MODERATOR: "Модератор",
  ADMIN: "Администратор",
  PREMIUM: "Премиум",
} as const;

export default function UsersTable({ users, onEditUser, onDeleteUser }: UsersTableProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const formatPhone = (phone: string) => {
    // Форматируем телефон в формате +7 (XXX) XXX-XX-XX
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 11 && cleaned.startsWith("7")) {
      const match = cleaned.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
      if (match) {
        return `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`;
      }
    }
    return phone;
  };

  return (
    <Paper sx={{ width: "100%", overflow: "hidden" }}>
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Пользователь
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  ID
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Роль
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Телефон
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Статус
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Дата регистрации
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight="bold">
                  Действия
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((user) => (
              <TableRow hover key={user.id}>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Avatar
                      src={user.profile?.avatarUrl || "/uploads/avatar.svg"}
                      alt={user.username}
                      sx={{ width: 32, height: 32 }}
                    />
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {user.profile?.fullName || user.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        @{user.username}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {user.id}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={roleLabels[user.role as keyof typeof roleLabels] || user.role}
                    color={roleColors[user.role as keyof typeof roleColors] || "default"}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatPhone(user.phone)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.isConfirmed ? "Подтвержден" : "Не подтвержден"}
                    color={user.isConfirmed ? "success" : "warning"}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(user.createdAt)}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <IconButton size="small" onClick={() => onEditUser(user)} color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => onDeleteUser(user.id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={users.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) =>
          `${from}-${to} из ${count !== -1 ? count : `более ${to}`}`
        }
      />
    </Paper>
  );
}

