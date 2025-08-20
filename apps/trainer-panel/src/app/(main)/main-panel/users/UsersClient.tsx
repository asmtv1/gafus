"use client";

import { useState } from "react";

import UsersTable from "@/app/(main)/main-panel/users/UsersTable";
import EditUserForm from "@/features/users/components/EditUserForm";
import { Box, Typography } from "@/utils/muiImports";

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

interface UsersClientProps {
  users: User[];
}

export default function UsersClient({ users }: UsersClientProps) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditFormOpen(true);
  };

  const handleDeleteUser = (_userId: string) => {
    if (confirm("Вы уверены, что хотите удалить этого пользователя?")) {
      // Простое удаление - в реальном приложении здесь можно добавить API вызов
      alert("Функция удаления будет реализована позже");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Пользователи платформы
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Список всех зарегистрированных пользователей
      </Typography>

      <UsersTable users={users} onEditUser={handleEditUser} onDeleteUser={handleDeleteUser} />

      {editingUser && (
        <EditUserForm
          user={editingUser}
          open={isEditFormOpen}
          onClose={() => {
            setIsEditFormOpen(false);
            setEditingUser(null);
          }}
        />
      )}
    </Box>
  );
}
