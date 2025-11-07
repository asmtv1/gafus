"use client";

import { useState } from "react";

import {
  Avatar,
  Box,
  Button,
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

  const formatDate = (date: Date | string) => {
    // Принимаем Date или string (после сериализации от сервера)
    const d = new Date(date);
    // Используем стабильное форматирование без Intl для избежания проблем с гидратацией
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
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
      <TableContainer 
        sx={{ 
          maxHeight: { xs: "none", sm: 600 },
          display: { xs: "none", sm: "block" }
        }}
      >
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
                    <IconButton 
                      size="small" 
                      onClick={() => onEditUser(user)} 
                      color="primary"
                      sx={{ minWidth: { xs: "44px", sm: "auto" }, minHeight: { xs: "44px", sm: "auto" } }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => onDeleteUser(user.id)} 
                      color="error"
                      sx={{ minWidth: { xs: "44px", sm: "auto" }, minHeight: { xs: "44px", sm: "auto" } }}
                    >
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

      {/* Мобильный вид - карточки */}
      <Box sx={{ display: { xs: "block", sm: "none" }, p: 2 }}>
        {users.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((user) => (
          <Paper
            key={user.id}
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              boxShadow: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Avatar
                src={user.profile?.avatarUrl || "/uploads/avatar.svg"}
                alt={user.username}
                sx={{ width: 48, height: 48 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" fontWeight="medium" noWrap>
                  {user.profile?.fullName || user.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  @{user.username}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  ID
                </Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: "break-all" }}>
                  {user.id}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Роль
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={roleLabels[user.role as keyof typeof roleLabels] || user.role}
                    color={roleColors[user.role as keyof typeof roleColors] || "default"}
                    size="small"
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Телефон
                </Typography>
                <Typography variant="body2">{formatPhone(user.phone)}</Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Статус
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={user.isConfirmed ? "Подтвержден" : "Не подтвержден"}
                    color={user.isConfirmed ? "success" : "warning"}
                    size="small"
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Дата регистрации
                </Typography>
                <Typography variant="body2">{formatDate(user.createdAt)}</Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <IconButton 
                size="small" 
                onClick={() => onEditUser(user)} 
                color="primary"
                sx={{ minWidth: { xs: "44px", sm: "auto" }, minHeight: { xs: "44px", sm: "auto" } }}
              >
                <EditIcon />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={() => onDeleteUser(user.id)} 
                color="error"
                sx={{ minWidth: { xs: "44px", sm: "auto" }, minHeight: { xs: "44px", sm: "auto" } }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </Paper>
        ))}

        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handleChangePage(null, Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Назад
            </Button>
            <Typography variant="body2" sx={{ px: 2 }}>
              {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, users.length)} из {users.length}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => handleChangePage(null, Math.min(Math.ceil(users.length / rowsPerPage) - 1, page + 1))}
              disabled={page >= Math.ceil(users.length / rowsPerPage) - 1}
            >
              Вперед
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

